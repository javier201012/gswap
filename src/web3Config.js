import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { bsc } from 'wagmi/chains'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'demo-project-id'

export const wagmiConfig = getDefaultConfig({
  appName: 'gswap',
  projectId,
  chains: [bsc],
  ssr: false,
})
