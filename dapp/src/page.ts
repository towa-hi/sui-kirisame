import { adminMarkup, adminOverlay, adminStyles, adminScript } from "./admin.js";

import { supplyMarkup, supplyScript } from "./supply.js";

const walletAddressNames = {
  '0xc5313e6b1943b8cc82f266d72ef2862a2ce32c8a6e1d609a5d4c55ba0cccb604': 'mono',
  '0xd821bffd23aadb112378600d8c02d89217d2a5f5bbe5574c1bcc887a686b5070': 'bob-borrower',
  '0xd8fd6bc0c0bc0bae5c618f1d7408e6febab749e2cf6f0afe178c9dc41fa6c282': 'station',
};

const walletControl = /* html */ `
          <button type="button" class="connect-wallet">Connect Slush Wallet</button>
          <div class="wallet-details" hidden aria-label="Connected wallet">
            <dl>
              <div><dt>Wallet address</dt><dd class="wallet-address"></dd></div>
              <div><dt>SUI balance · Testnet</dt><dd class="wallet-balance" aria-live="polite"></dd></div>
            </dl>
            <button type="button" class="refresh-balance" aria-label="Refresh balance" title="Refresh balance">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M20 7v5h-5M4 17v-5h5" />
                <path d="M6.1 6.1A8 8 0 0 1 19.6 10M4.4 14A8 8 0 0 0 17.9 17.9" />
              </svg>
            </button>
          </div>
          <p class="wallet-status" role="status" aria-live="polite"></p>`;

export const page = /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Kirisame</title>
    <style>
      * { box-sizing: border-box; }
      body {
        width: 100%;
        max-width: 430px;
        margin: 0 auto;
        min-height: 100vh;
        min-height: 100svh;
        background: #f3f5f1;
        color: #243c32;
        font-family: system-ui, sans-serif;
      }
      header {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: space-between;
        gap: 1rem;
        width: calc(100% - 2rem);
        margin: 0 auto;
        padding: 1.5rem 0 .75rem;
      }
      .brand { font-weight: 650; letter-spacing: -.02em; }
      nav { display: flex; width: 100%; gap: .25rem; padding: .25rem; border-radius: .75rem; background: #e7ebe5; }
      button {
        border: 0;
        border-radius: .55rem;
        flex: 1;
        min-width: 0;
        padding: .65rem .5rem;
        background: transparent;
        color: #526358;
        font: inherit;
        cursor: pointer;
      }
      button[aria-selected="true"] { background: #fff; color: #243c32; box-shadow: 0 1px 5px #243c3214; }
      button:focus-visible { outline: 2px solid #557866; outline-offset: 2px; }
      main { width: calc(100% - 2rem); margin: 0 auto; padding: 0 0 4rem; }
      [role="tabpanel"][hidden] { display: none; }
      .panel-content { overflow-wrap: anywhere; }
      .user-tabs { margin-top: 1rem; }
      .umbrella-action { width: 100%; min-height: 48px; margin-top: 1rem; background: #243c32; color: #fff; font-weight: 600; }
      .umbrella-action:hover { background: #365544; }
      p { line-height: 1.7; }
      .connect-wallet { width: 100%; min-height: 48px; margin-top: 0; background: #243c32; color: #fff; font-weight: 600; }
      .connect-wallet:hover { background: #365544; }
      .connect-wallet:disabled { opacity: .65; cursor: wait; }
      .wallet-details { position: relative; margin-top: .5rem; padding: .75rem; border: 1px solid #cad4cc; border-radius: .75rem; background: #fff; }
      .wallet-details dl { margin: 0; padding-right: 2rem; }
      .wallet-details dl > div + div { margin-top: .5rem; }
      .wallet-details dt { font-size: .75rem; color: #526358; margin-bottom: .15rem; }
      .wallet-details dd { margin: 0; }
      .wallet-address { font-family: ui-monospace, monospace; font-size: .75rem; line-height: 1.35; overflow-wrap: anywhere; }
      .wallet-balance { font-size: 1.1rem; font-weight: 600; }
      .refresh-balance { position: absolute; top: .25rem; right: .25rem; display: grid; place-items: center; width: 36px; height: 36px; padding: 0; }
      .refresh-balance:hover { background: #e7ebe5; }
      .refresh-balance:disabled { opacity: .6; cursor: wait; }
      .wallet-status { font-size: .875rem; color: #526358; overflow-wrap: anywhere; }
      .wallet-status:empty { display: none; }
      .status { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #cad4cc; color: #526358; }
      ${adminStyles}
      #supply-error { color: #9a332e; }
      #supply-error:empty, #supply-result:empty { display: none; }
    </style>
  </head>
  <body>
    <header>
      <span class="brand">Kirisame</span>
      <div class="wallet-control" aria-label="Wallet">
        ${walletControl}
      </div>
      <nav role="tablist" aria-label="Kirisame sections">
        <button id="user-tab" role="tab" aria-selected="true" aria-controls="user-panel" data-tab="user">User</button>
        <button id="station-tab" role="tab" aria-selected="false" aria-controls="station-panel" data-tab="station" tabindex="-1">Station</button>
        <button id="admin-tab" role="tab" aria-selected="false" aria-controls="admin-panel" data-tab="admin" tabindex="-1">Admin</button>
      </nav>
    </header>
    <main>
      <section id="user-panel" role="tabpanel" aria-labelledby="user-tab">
        <div class="panel-content">
          <nav class="user-tabs" role="tablist" aria-label="User actions">
            <button id="purchase-tab" role="tab" aria-selected="true" aria-controls="purchase-panel">Purchase</button>
            <button id="supply-tab" role="tab" aria-selected="false" aria-controls="supply-panel" tabindex="-1">Supply</button>
          </nav>
          <section id="purchase-panel" role="tabpanel" aria-labelledby="purchase-tab">
            <button type="button" class="umbrella-action">SCAN UMBRELLA</button>
            <p class="status">Under construction. Features are coming one at a time.</p>
          </section>
          <section id="supply-panel" role="tabpanel" aria-labelledby="supply-tab" hidden>
            ${supplyMarkup}
          </section>
        </div>
      </section>
      <section id="station-panel" role="tabpanel" aria-labelledby="station-tab" hidden>
        <div class="panel-content">
          <p class="status">Under construction. Features are coming one at a time.</p></div>
      </section>
      <section id="admin-panel" role="tabpanel" aria-labelledby="admin-tab" hidden>
        <div class="panel-content">
          ${adminMarkup}</div>
      </section>
    </main>
    ${adminOverlay}
    <script>
      ${adminScript}
      ${supplyScript}
      const buttons = [...document.querySelectorAll('.connect-wallet')];
      const statuses = [...document.querySelectorAll('.wallet-status')];
      const details = [...document.querySelectorAll('.wallet-details')];
      const addresses = [...document.querySelectorAll('.wallet-address')];
      const balances = [...document.querySelectorAll('.wallet-balance')];
      const refreshButtons = [...document.querySelectorAll('.refresh-balance')];
      let balanceText = '';
      let balancePending = false;
      let balanceRequest = 0;
      const wallets = new Set();
      let activeWallet = null;
      let account = null;
      let pending = false;
      let unsubscribe = () => {};

      function isMonoWallet() {
        return account?.address?.toLowerCase() === ${JSON.stringify(Object.keys(walletAddressNames).find(address => walletAddressNames[address as keyof typeof walletAddressNames] === 'mono'))};
      }
      renderAdminAccess();

      function renderWallet(message = '') {
        renderSupplyAccess();
        renderAdminAccess();
        for (const button of buttons) {
          button.disabled = pending;
          button.textContent = pending ? 'Connecting…' : account ? 'Disconnect Slush Wallet' : 'Connect Slush Wallet';
        }
        for (const status of statuses) {
          status.textContent = message;
        }
      }
      function renderDetails() {
        for (const panel of details) panel.hidden = !account;
        const walletAddress = account?.address || '';
        const addressNames = ${JSON.stringify(walletAddressNames)};
        const addressName = addressNames[walletAddress.toLowerCase()];
        for (const address of addresses) address.textContent = addressName ? addressName + ' · ' + walletAddress : walletAddress;
        for (const balance of balances) balance.textContent = balanceText;
        for (const button of refreshButtons) {
          button.disabled = balancePending;
          const label = balancePending ? 'Refreshing balance…' : 'Refresh balance';
          button.setAttribute('aria-label', label);
          button.setAttribute('aria-busy', String(balancePending));
          button.title = label;
        }
      }
      function formatSui(mist) {
        const amount = BigInt(mist);
        const fraction = (amount % 1000000000n).toString().padStart(9, '0').replace(/0+$/, '');
        return (amount / 1000000000n).toLocaleString('en-US') + (fraction ? '.' + fraction : '') + ' SUI';
      }
      async function refreshBalance() {
        const request = ++balanceRequest;
        if (!account) return;
        balancePending = true;
        balanceText = 'Loading…';
        renderDetails();
        try {
          const response = await fetch('/api/balance/' + encodeURIComponent(account.address), {
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error('Balance request failed');
          const data = await response.json();
          if (typeof data.balance !== 'string' || !/^[0-9]+$/.test(data.balance)) throw new Error('Invalid balance');
          if (request === balanceRequest) balanceText = formatSui(data.balance);
        } catch {
          if (request === balanceRequest) balanceText = 'Unable to load balance';
        } finally {
          if (request === balanceRequest) {
            balancePending = false;
            renderDetails();
          }
        }
      }
      for (const button of refreshButtons) button.addEventListener('click', () => void refreshBalance());

      function setAccounts(accounts) {
        account = accounts.find(item => item.chains.some(chain => chain.startsWith('sui:'))) || null;
        balanceRequest++;
        balancePending = false;
        balanceText = '';
        renderWallet();
        renderDetails();
        if (account) void refreshBalance();
      }
      function clearWallet() {
        unsubscribe();
        unsubscribe = () => {};
        activeWallet = null;
        account = null;
        balanceRequest++;
        balancePending = false;
        balanceText = '';
        renderWallet();
        renderDetails();
      }
      // Wallet Standard discovers both extensions and Slush's in-app browser.
      const walletApi = Object.freeze({ register(...registered) {
        for (const wallet of registered) wallets.add(wallet);
        return () => {
          for (const wallet of registered) {
            wallets.delete(wallet);
            if (activeWallet === wallet) clearWallet();
          }
        };
      } });
      window.addEventListener('wallet-standard:register-wallet', event => event.detail(walletApi));
      window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: walletApi }));

      for (const button of buttons) button.addEventListener('click', async () => {
        if (pending) return;
        pending = true;
        renderWallet();
        try {
          if (account) {
            await activeWallet.features['standard:disconnect']?.disconnect();
            clearWallet();
            return;
          }
          const wallet = [...wallets].find(item =>
            ['Slush', 'Sui Wallet'].includes(item.name) && item.features['standard:connect']
          );
          if (!wallet) {
            const url = new URL(location.href);
            url.hash = document.querySelector('[role="tab"][aria-selected="true"]').dataset.tab;
            location.assign('https://my.slush.app/browse/' + encodeURIComponent(url.href));
            return;
          }
          const result = await wallet.features['standard:connect'].connect();
          clearWallet();
          activeWallet = wallet;
          setAccounts(result.accounts);
          if (!account) throw new Error('No Sui account was shared. Please try connecting again.');
          unsubscribe = wallet.features['standard:events']?.on('change', change => {
            if (change.accounts) setAccounts(change.accounts);
          }) || (() => {});
        } catch (error) {
          renderWallet(error instanceof Error ? error.message : 'Unable to connect. Please try again.');
        } finally {
          pending = false;
          const message = statuses[0].textContent;
          renderWallet(message);
        }
      });

      const tabs = [...document.querySelectorAll('[role="tab"][data-tab]')];
      function selectTab(tab) {
        for (const item of tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')) {
          const selected = item === tab;
          item.setAttribute('aria-selected', String(selected));
          item.tabIndex = selected ? 0 : -1;
          document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
        }
      }
      const initialTab = tabs.find(tab => tab.dataset.tab === location.hash.slice(1));
      if (initialTab) selectTab(initialTab);
      for (const tab of document.querySelectorAll('[role="tab"]')) {
        tab.addEventListener('click', () => selectTab(tab));
        tab.addEventListener('keydown', (event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const siblings = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const next = event.key === 'Home' ? siblings[0] : event.key === 'End' ? siblings[siblings.length - 1] : siblings[(siblings.indexOf(tab) + direction + siblings.length) % siblings.length];
          selectTab(next);
          next.focus();
        });
      }
    </script>
  </body>
</html>`;
