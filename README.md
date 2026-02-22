# gswap

Frontend Web3 construido con Vite + React para Binance Smart Chain (BSC).

## Funcionalidades

- Conectar wallet Rabby (inyección EVM).
- Forzar/cambiar a red BSC.
- Consultar balances de BNB, USDT, USDC y BUSD.
- Enviar BNB o tokens ERC20 desde la wallet conectada.

## Uso

1. Instala dependencias:

	npm install

2. Configura variables de entorno:

	- Copia .env.example a .env
	- Reemplaza VITE_WALLETCONNECT_PROJECT_ID por tu Project ID de Reown/WalletConnect

3. Ejecuta entorno de desarrollo:

	npm run dev

4. Abre la URL local en el navegador y conecta la wallet desde el modal de RainbowKit.

## Build

npm run build
