import { ConnectButton } from '@mysten/dapp-kit'
import { CreateUserBtn } from '../components/CreateUserBtn'

export function HomePage() {

  return (
    <div>

      <div>
        <ConnectButton />
        <CreateUserBtn />
      </div>
    </div>
  )
}
