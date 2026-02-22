import { useEffect, useMemo, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, useConnections, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { bsc } from 'wagmi/chains'
import { erc20Abi, formatEther, formatUnits, isAddress, parseEther, parseUnits } from 'viem'
import './App.css'

const BSC_CHAIN_ID = 56
const HISTORY_STORAGE_KEY = 'gswap_tx_history'

const TOKENS = [
  { symbol: 'BNB', type: 'native', decimals: 18 },
  { symbol: 'USDT', type: 'erc20', decimals: 18, address: '0x55d398326f99059fF775485246999027B3197955' },
  { symbol: 'USDC', type: 'erc20', decimals: 18, address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' },
  { symbol: 'BUSD', type: 'erc20', decimals: 18, address: '0xe9e7cea3dedca5984780bafc599bd69add087d56' },
]

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
  const publicClient = usePublicClient({ chainId: bsc.id })
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()

  const [balances, setBalances] = useState({})
  const [selectedTokenSymbol, setSelectedTokenSymbol] = useState('BNB')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [history, setHistory] = useState([])

  const selectedToken = useMemo(
    () => TOKENS.find((token) => token.symbol === selectedTokenSymbol) ?? TOKENS[0],
    [selectedTokenSymbol],
  )

  const isBscNetwork = chainId === BSC_CHAIN_ID

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

    const nextBalances = {}
    for (const token of TOKENS) {
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
    }

    setBalances(nextBalances)
  }

  async function switchToBsc() {
    try {
      await switchChainAsync({ chainId: bsc.id })
      setSuccess('Red cambiada a Binance Smart Chain.')
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

    if (!isBscNetwork) {
      setError('Debes estar en Binance Smart Chain (BSC).')
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
          chain: bsc,
        })
      } else {
        txHash = await walletClient.writeContract({
          account: address,
          address: selectedToken.address,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [recipient, parseUnits(amount, selectedToken.decimals)],
          chain: bsc,
        })
      }

      await publicClient.waitForTransactionReceipt({ hash: txHash })
      await refreshBalances(address)

      const historyItem = {
        date: new Date().toISOString(),
        amount,
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
  }, [address, isConnected, chainId, publicClient])

  return (
    <main className="app">
      <header className="header">
        <div className="header-main">
          <p className="badge">BSC / Rabby</p>
          <h1>gswap</h1>
          <p className="subtitle">Portal Web3 para gestionar y enviar activos en Binance Smart Chain.</p>
          <div className="header-metrics">
            <article className="metric-card">
              <span>Wallet</span>
              <strong>{address ? shortAddress(address) : 'No conectada'}</strong>
            </article>
            <article className="metric-card">
              <span>Network</span>
              <strong>{isBscNetwork ? 'Binance Smart Chain' : chainId ? `Chain ${chainId}` : '—'}</strong>
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
          <span className={`status-dot ${isBscNetwork ? 'ok' : 'warn'}`} />
          <span>
            Estado de red:{' '}
            <strong>{isBscNetwork ? 'Lista para operar en BSC' : 'Conecta o cambia a Binance Smart Chain'}</strong>
          </span>
        </div>
        {isConnected && !isBscNetwork ? (
          <button type="button" className="secondary-button" onClick={switchToBsc}>
            Cambiar a BSC
          </button>
        ) : null}
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="section-head">
            <h2>Balances</h2>
            <small>{address ? 'Actualizados desde wallet conectada' : 'Conecta tu wallet para ver saldos'}</small>
          </div>
          <div className="token-grid">
            {TOKENS.map((token) => (
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
                {TOKENS.map((token) => (
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
                <th>Wallet envía</th>
                <th>Wallet recibe</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="5" className="history-empty">
                    Aún no hay operaciones.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.hash}>
                    <td>{new Date(item.date).toLocaleString()}</td>
                    <td>{item.amount}</td>
                    <td>{shortAddress(item.from)}</td>
                    <td>{shortAddress(item.to)}</td>
                    <td>
                      <a href={`https://bscscan.com/tx/${item.hash}`} target="_blank" rel="noreferrer">
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
