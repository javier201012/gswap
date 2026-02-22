import { useEffect, useMemo, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, useConnections, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { arbitrum, bsc, polygon } from 'wagmi/chains'
import { erc20Abi, formatEther, formatUnits, isAddress, parseEther, parseUnits } from 'viem'
import './App.css'

const HISTORY_STORAGE_KEY = 'gswap_tx_history'
const SUPPORTED_CHAINS = [bsc, polygon, arbitrum]
const DEFAULT_CHAIN = bsc

const TOKENS_BY_CHAIN = {
  [bsc.id]: [
    { symbol: 'BNB', type: 'native', decimals: 18 },
    { symbol: 'USDT', type: 'erc20', decimals: 18, address: '0x55d398326f99059fF775485246999027B3197955' },
    { symbol: 'USDC', type: 'erc20', decimals: 18, address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' },
    { symbol: 'BUSD', type: 'erc20', decimals: 18, address: '0xe9e7cea3dedca5984780bafc599bd69add087d56' },
  ],
  [polygon.id]: [
    { symbol: 'MATIC', type: 'native', decimals: 18 },
    { symbol: 'USDT', type: 'erc20', decimals: 6, address: '0xc2132D05D31c914a87C6611C10748AaCbC532DaE' },
    { symbol: 'USDC', type: 'erc20', decimals: 6, address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
    { symbol: 'DAI', type: 'erc20', decimals: 18, address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' },
  ],
  [arbitrum.id]: [
    { symbol: 'ETH', type: 'native', decimals: 18 },
    { symbol: 'USDT', type: 'erc20', decimals: 6, address: '0xFd086bC7CD5C481DCC9C85ebe478A1C0b69FCbb9' },
    { symbol: 'USDC', type: 'erc20', decimals: 6, address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
    { symbol: 'DAI', type: 'erc20', decimals: 18, address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1' },
  ],
}

const EXPLORER_BY_CHAIN = {
  [bsc.id]: 'https://bscscan.com/tx/',
  [polygon.id]: 'https://polygonscan.com/tx/',
  [arbitrum.id]: 'https://arbiscan.io/tx/',
}

function shortAddress(address) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatBalance(balance) {
  const numeric = Number(balance)
  if (!Number.isFinite(numeric)) return '0'
  if (numeric === 0) return '0'
  if (numeric < 0.0001) return '<0.0001'
  return numeric.toFixed(4)
}

function App() {
  const { address, isConnected } = useAccount()
  const connections = useConnections()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const currentChain = useMemo(
    () => SUPPORTED_CHAINS.find((chain) => chain.id === chainId) ?? DEFAULT_CHAIN,
    [chainId],
  )
  const publicClient = usePublicClient({ chainId: currentChain.id })
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()

  const [balances, setBalances] = useState({})
  const [selectedTokenSymbol, setSelectedTokenSymbol] = useState('BNB')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [history, setHistory] = useState([])

  const tokens = useMemo(() => TOKENS_BY_CHAIN[currentChain.id] ?? TOKENS_BY_CHAIN[DEFAULT_CHAIN.id], [currentChain.id])

  const selectedToken = useMemo(
    () => tokens.find((token) => token.symbol === selectedTokenSymbol) ?? tokens[0],
    [selectedTokenSymbol, tokens],
  )

  const isSupportedNetwork = SUPPORTED_CHAINS.some((chain) => chain.id === chainId)

  function refreshPageAfterAction(delay = 500) {
    window.setTimeout(() => {
      window.location.reload()
    }, delay)
  }

  async function handleDisconnect() {
    setError('')
    setSuccess('')

    try {
      if (connections.length > 0) {
        for (const connection of connections) {
          disconnect({ connector: connection.connector })
        }
      } else {
        disconnect()
      }

      localStorage.removeItem('wagmi.store')
      localStorage.removeItem('rk-rainbowkit_recentWallets')
      localStorage.removeItem('rk-rainbowkit_wallet')

      setRecipient('')
      setAmount('')
      setSuccess('Wallet desconectada correctamente.')
      refreshPageAfterAction()
    } catch {
      setError('No se pudo desconectar la wallet. Intenta nuevamente.')
    }
  }

  async function refreshBalances(nextAccount) {
    if (!publicClient || !nextAccount) return

    setIsRefreshingBalances(true)

    try {
      const nextBalances = {}
      for (const token of tokens) {
        try {
          if (token.type === 'native') {
            const value = await publicClient.getBalance({ address: nextAccount })
            nextBalances[token.symbol] = formatEther(value)
            continue
          }

          const value = await publicClient.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [nextAccount],
          })
          nextBalances[token.symbol] = formatUnits(value, token.decimals)
        } catch {
          nextBalances[token.symbol] = '0'
        }
      }

      setBalances(nextBalances)
    } finally {
      setIsRefreshingBalances(false)
    }
  }

  async function switchToChain(nextChainId) {
    try {
      const chain = SUPPORTED_CHAINS.find((item) => item.id === nextChainId)
      if (!chain) return
      await switchChainAsync({ chainId: nextChainId })
      setSuccess(`Red cambiada a ${chain.name}.`)
      refreshPageAfterAction()
    } catch {
      setError('No se pudo cambiar de red.')
    }
  }

  async function sendTransfer(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!address || !isConnected) {
      setError('Primero conecta tu wallet.')
      return
    }

    if (!isSupportedNetwork) {
      setError('Red no soportada. Usa BSC, Polygon o Arbitrum.')
      return
    }

    if (!walletClient) {
      setError('No pude inicializar la firma de la wallet. Cierra y vuelve a conectar.')
      return
    }

    if (!isAddress(recipient)) {
      setError('Dirección de destino inválida.')
      return
    }

    if (!amount || Number(amount) <= 0) {
      setError('Ingresa un monto válido.')
      return
    }

    setIsSending(true)

    try {
      let txHash

      if (selectedToken.type === 'native') {
        txHash = await walletClient.sendTransaction({
          account: address,
          to: recipient,
          value: parseEther(amount),
          chain: currentChain,
        })
      } else {
        txHash = await walletClient.writeContract({
          account: address,
          address: selectedToken.address,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [recipient, parseUnits(amount, selectedToken.decimals)],
          chain: currentChain,
        })
      }

      await publicClient.waitForTransactionReceipt({ hash: txHash })
      await refreshBalances(address)

      const historyItem = {
        date: new Date().toISOString(),
        amount,
        token: selectedToken.symbol,
        chainId: currentChain.id,
        from: address,
        to: recipient,
        hash: txHash,
      }

      setHistory((previous) => {
        const nextHistory = [historyItem, ...previous]
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory))
        return nextHistory
      })

      setSuccess(`Transferencia enviada: ${txHash}`)
      setAmount('')
      setRecipient('')
      refreshPageAfterAction()
    } catch {
      setError('La transacción falló o fue rechazada.')
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (!savedHistory) return
      const parsed = JSON.parse(savedHistory)
      if (Array.isArray(parsed)) {
        setHistory(parsed)
      }
    } catch {
      setHistory([])
    }
  }, [])

  useEffect(() => {
    if (!isConnected || !address) {
      setBalances({})
      return
    }

    refreshBalances(address)
  }, [address, isConnected, chainId, publicClient, currentChain.id])

  useEffect(() => {
    if (!tokens.some((token) => token.symbol === selectedTokenSymbol)) {
      setSelectedTokenSymbol(tokens[0].symbol)
    }
  }, [tokens, selectedTokenSymbol])

  return (
    <main className="app">
      <header className="header">
        <div className="header-main">
          <p className="badge">BSC / Polygon / Arbitrum</p>
          <h1>gswap</h1>
          <p className="subtitle">Portal Web3 para gestionar y enviar activos en redes EVM soportadas.</p>
          <div className="header-metrics">
            <article className="metric-card">
              <span>Wallet</span>
              <strong>{address ? shortAddress(address) : 'No conectada'}</strong>
            </article>
            <article className="metric-card">
              <span>Network</span>
              <strong>{chainId ? currentChain.name : '—'}</strong>
            </article>
            <article className="metric-card">
              <span>Estado saldos</span>
              <strong>{isRefreshingBalances ? 'Actualizando...' : 'Sincronizado'}</strong>
            </article>
          </div>
        </div>
        <div className="wallet-actions">
          <ConnectButton label="Conectar Wallet" chainStatus="name" showBalance={false} accountStatus="address" />
          {isConnected ? (
            <button type="button" className="secondary-button disconnect-button" onClick={handleDisconnect}>
              Desconectar Wallet
            </button>
          ) : null}
        </div>
      </header>

      <section className="panel status-panel">
        <div className="status-row">
          <span className={`status-dot ${isSupportedNetwork ? 'ok' : 'warn'}`} />
          <span>
            Estado de red:{' '}
            <strong>
              {isSupportedNetwork ? `Lista para operar en ${currentChain.name}` : 'Cambia a BSC, Polygon o Arbitrum'}
            </strong>
          </span>
        </div>
        <div className="chain-actions">
          {SUPPORTED_CHAINS.map((chain) => (
            <button
              key={chain.id}
              type="button"
              className={`secondary-button ${chainId === chain.id ? 'chain-active' : ''}`}
              onClick={() => switchToChain(chain.id)}
            >
              {chain.name}
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="section-head">
            <h2>Balances</h2>
            <small>{address ? 'Actualizados desde wallet conectada' : 'Conecta tu wallet para ver saldos'}</small>
          </div>
          <div className="balances-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!address || isRefreshingBalances}
              onClick={() => refreshBalances(address)}
            >
              {isRefreshingBalances ? 'Actualizando...' : 'Actualizar saldos'}
            </button>
          </div>
          <div className="token-grid">
            {tokens.map((token) => (
              <article
                key={token.symbol}
                className={`token-card ${selectedTokenSymbol === token.symbol ? 'active' : ''}`}
                onClick={() => setSelectedTokenSymbol(token.symbol)}
              >
                <p>{token.symbol}</p>
                <strong>{address ? formatBalance(balances[token.symbol]) : '—'}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Enviar</h2>
            <small>Selecciona token, dirección y monto</small>
          </div>
          <form className="transfer-form" onSubmit={sendTransfer}>
            <label>
              Token
              <select value={selectedTokenSymbol} onChange={(event) => setSelectedTokenSymbol(event.target.value)}>
                {tokens.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Dirección destino
              <input
                type="text"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x..."
              />
            </label>

            <label>
              Monto
              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </label>

            <button type="submit" className="primary-button" disabled={isSending || !address}>
              {isSending ? 'Enviando...' : `Enviar ${selectedToken.symbol}`}
            </button>
          </form>
        </section>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Histórico de operaciones</h2>
          <small>{history.length} registro(s)</small>
        </div>
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Importe</th>
                <th>Red</th>
                <th>Wallet envía</th>
                <th>Wallet recibe</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="6" className="history-empty">
                    Aún no hay operaciones.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.hash}>
                    <td>{new Date(item.date).toLocaleString()}</td>
                    <td>{`${item.amount} ${item.token ?? ''}`.trim()}</td>
                    <td>{SUPPORTED_CHAINS.find((chain) => chain.id === item.chainId)?.name ?? 'N/D'}</td>
                    <td>{shortAddress(item.from)}</td>
                    <td>{shortAddress(item.to)}</td>
                    <td>
                      <a
                        href={`${EXPLORER_BY_CHAIN[item.chainId] ?? EXPLORER_BY_CHAIN[DEFAULT_CHAIN.id]}${item.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddress(item.hash)}
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className="feedback error">{error}</p> : null}
      {success ? <p className="feedback success">{success}</p> : null}
    </main>
  )
}

export default App
