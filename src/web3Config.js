import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { arbitrum, bsc, polygon } from 'wagmi/chains'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'demo-project-id'

export const wagmiConfig = getDefaultConfig({
  appName: 'gswap',
  projectId,
  chains: [bsc, polygon, arbitrum],
  ssr: false,
})
