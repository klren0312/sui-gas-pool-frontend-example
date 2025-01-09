#### 1）配代理
rpc接口有跨域问题，先在开发工具里配置接口代理
```typescript
import { defineConfig } from '@farmfe/core';
export default defineConfig({
  server: {
    proxy: {
      '/v1': {
        target: 'http://localhost:9527',
        changeOrigin: true,
      }
    }
  }
});
```

#### 2）封装两个请求方法
预留gas的请求方法，入参就是gas值
```typescript
const doReserveGas = (gasUsed: string) => {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer zzespooltoken`
      },
      body: JSON.stringify({
        'gas_budget': parseInt(gasUsed),
        'reserve_duration_secs': 300
      })
    }
    return fetch('/v1/reserve_gas', requestOptions).then((res) => res.json()).catch((error) => {
      console.error(error)
      return null
    }) as Promise<ReserveGasResponse>
  }
```
执行赞助交易的请求方法，入参就是上面预留gas的id、交易字节和用户签名，交易字节和用户签名可以通过`useSignTransaction`的签名方法获取
```typescript
const executeTx = (reservationId: number, txBytes: string, userSig: string) => {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer zzespooltoken`
      },
      body: JSON.stringify({
        'reservation_id': reservationId,
        'tx_bytes': txBytes,
        'user_sig': userSig
      })
    }
    return fetch('/v1/execute_tx', requestOptions).then((response) => response.json()).catch((error) => {
      console.error(error)
      return null
    }) as Promise<ExecuteTxResponse>
  }
```


#### 3）编写交易（测试网运行）
测试的合约是 `0x485e975299a5d5df56967462a9e585faeb1687ed79b11704ace090b5ac84f5af`
server对象是`0x8443d3ada68fd36b894e9e91019f8045ca6bd1f9a8db1ec5d1681c534b54d602`

先构建交易，然后通过`client.devInspectTransactionBlock`预估gas值
```typescript
const txb = new Transaction()
txb.moveCall({
  target: `${packageId}::week_one::create_profile`,
  arguments: [
    txb.pure.string('test' + Date.now()),
    txb.pure.string('test' + Date.now()),
    txb.object(server),
  ],
})
const result = await client.devInspectTransactionBlock({
  transactionBlock: txb,
  sender: account?.address || '0x0',
})
const gasUsed = result.effects.gasUsed.storageRebate
```

然后将预估的gas值传入sui gas pool，获得需要的赞助交易地址，gas币数组以及预留gas的id

```typescript
// 预留gas
const reserveGasRes = await doReserveGas(gasUsed)
if (reserveGasRes?.error) {
  message.error('预留gas失败')
  return
}
const reservationId = reserveGasRes.result.reservation_id
const gasCoins = reserveGasRes.result.gas_coins
const sponsorAddress = reserveGasRes.result.sponsor_address
```

然后按照文档： https://sdk.mystenlabs.com/typescript/transaction-building/sponsored-transactions
设置一些赞助交易的参数
```typescript
// 设置赞助交易参数
txb.setSender(account?.address || '0x0')
txb.setGasPayment(gasCoins)
txb.setGasOwner(sponsorAddress)
```

对交易进行签名，签名结果的 bytes, signature 加上上面获取的gas预留id，可以传入rpc的赞助交易接口，完成赞助交易
```
// 签名
signTransaction(
  {
    transaction: txb,
  },
  {
    onSuccess: async ({ bytes, signature }) => {
      // 执行赞助交易
      const executeTxRes = await executeTx(reservationId, bytes, signature).finally(() => {
        setLoading(false)
      })
      if (executeTxRes?.error) {
        messageApi.error('执行交易失败')
        return
      }
      setTxDigest(executeTxRes.effects.transactionDigest)
      messageApi.success('赞助交易成功')
    },
    onError: (error) => {
      setLoading(false)
      messageApi.error('交易签名失败' + error.message)
    }
  }
)
```

#### 4）结果展示
可以查看测试用户钱包：[0x00c46d25eb8612f783ad2f87e700f1c042629a0d0a31a59c0226ee80aa204718](https://suiscan.xyz/testnet/account/0x00c46d25eb8612f783ad2f87e700f1c042629a0d0a31a59c0226ee80aa204718/activity)，Sui 为空。
![image.png](https://upload-images.jianshu.io/upload_images/2245742-1dfbf0120c2ba545.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

执行赞助交易的digest：[Q5Y1UsRTE3j3q5HV4g21LQnuG6XndzxgStAau6YwEur](https://suiscan.xyz/testnet/tx/Q5Y1UsRTE3j3q5HV4g21LQnuG6XndzxgStAau6YwEur)
可以看到gas是由赞助钱包支付

![image.png](https://upload-images.jianshu.io/upload_images/2245742-7b14eca70d809631.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
