import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { arbitrum, bsc, polygon } from 'wagmi/chains'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'demo-project-id'

export const wagmiConfig = getDefaultConfig({
  appName: 'gswap',
  projectId,
  chains: [bsc, polygon, arbitrum],
  transports: {
    [bsc.id]: http('https://bsc-dataseed.binance.org'),
    [polygon.id]: http('https://polygon-rpc.com'),
    [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
  },
  ssr: false,
})
