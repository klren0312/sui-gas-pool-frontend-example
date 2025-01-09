import { useCurrentAccount, useSignTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { Button, message } from 'antd'
import { useState } from 'react'
import { useNetworkVariable } from '../utils/networkConfig'

interface ReserveGasResponse {
  result: {
    sponsor_address: string
    reservation_id: number
    gas_coins: {
      objectId: string
      version: number
      digest: string
    }[]
  }
  error: null
}

interface ExecuteTxResponse {
  effects: {
    messageVersion: string
    status: {
      status: string
    }
    transactionDigest: string
  }
  error: null
}

export function CreateUserBtn() {
  const [loading, setLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const [txDigest, setTxDigest] = useState('')
  const packageId = useNetworkVariable('packageId')
  const server = useNetworkVariable('server')

  const { mutate: signTransaction } = useSignTransaction()
  const account = useCurrentAccount()
  const client = useSuiClient()


  const onOk = async () => {
    setLoading(true)
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

    // 预留gas
    const reserveGasRes = await doReserveGas(gasUsed)
    if (reserveGasRes?.error) {
      message.error('预留gas失败')
      return
    }
    const reservationId = reserveGasRes.result.reservation_id
    const gasCoins = reserveGasRes.result.gas_coins
    const sponsorAddress = reserveGasRes.result.sponsor_address

    // 设置赞助交易参数
    txb.setSender(account?.address || '0x0')
    txb.setGasPayment(gasCoins)
    txb.setGasOwner(sponsorAddress)

    // 签名
    signTransaction(
      {
        transaction: txb,
      },
      {
        onSuccess: async ({ bytes, signature, reportTransactionEffects }) => {
          console.log(bytes, signature, reportTransactionEffects)
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
  }

  /**
   * 预留gas
   */
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

  /**
   * 执行赞助交易
   */
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

  return (
    <>
      {contextHolder}
      <Button onClick={onOk} loading={loading}>创建用户</Button>
      <div>digest: <a href={`https://suiscan.xyz/testnet/tx/${txDigest}`} target="_blank" rel="noreferrer">{txDigest}</a></div>
    </>
  )
}