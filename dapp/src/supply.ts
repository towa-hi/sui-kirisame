export const supplyMarkup = /* html */ `
  <form id="supply-form">
    <div class="admin-heading"><h1>Create umbrella</h1>
      <p>Register an umbrella to supply to a station.</p></div>
    <label class="admin-field" for="umbrella-color">Color
      <select id="umbrella-color" name="color" required>
        <option value="">Choose a color</option>
        <option value="0">Vinyl</option>
        <option value="1">Black</option>
        <option value="2">White</option>
      </select>
    </label>
    <p>A 0.03 SUI condition bond is held by the contract. You also pay network gas fees. After creation, bring the umbrella to a station for docking.</p>
    <button type="submit" id="supply-confirm" class="umbrella-action" disabled>Create umbrella</button>
    <p id="supply-status" role="status" aria-live="polite">Connect Slush Wallet to create an umbrella on testnet.</p>
    <p id="supply-error" role="alert"></p>
    <p id="supply-result" role="status"></p>
  </form>
`;

export const supplyScript = /* js */ `
  const supplyForm = document.getElementById('supply-form');
  const supplyConfirm = document.getElementById('supply-confirm');
  const supplyColor = document.getElementById('umbrella-color');
  const supplyStatus = document.getElementById('supply-status');
  const supplyError = document.getElementById('supply-error');
  const supplyResult = document.getElementById('supply-result');
  let supplyPending = false;
  function renderSupplyAccess() {
    supplyConfirm.disabled = supplyPending || !account;
    supplyColor.disabled = supplyPending;
    supplyConfirm.textContent = supplyPending ? 'Creating…' : 'Create umbrella';
    supplyForm.setAttribute('aria-busy', String(supplyPending));
    if (!supplyPending) supplyStatus.textContent = account ? 'Testnet · 0.03 SUI bond + gas' : 'Connect Slush Wallet to create an umbrella on testnet.';
  }
  function supplyTransactionLink(digest) {
    const link = document.createElement('a');
    link.href = 'https://suiscan.xyz/testnet/tx/' + encodeURIComponent(digest);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = ' View transaction';
    return link;
  }
  supplyForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (supplyPending || !account || !supplyForm.reportValidity()) return;
    const color = Number(supplyColor.value);
    supplyError.textContent = '';
    supplyResult.textContent = '';
    supplyPending = true;
    renderSupplyAccess();
    supplyStatus.textContent = 'Preparing transaction…';
    let digest;
    try {
      const signingAccount = account;
      const signingWallet = activeWallet;
      const feature = signingWallet?.features['sui:signAndExecuteTransaction'];
      if (!feature) throw new Error('This wallet does not support transaction signing. Update Slush and try again.');
      if (!signingAccount.chains.includes('sui:testnet')) throw new Error('Switch your wallet to Sui testnet.');
      const response = await fetch('/api/supply/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: signingAccount.address, color }), signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to prepare the transaction.');
      if (account !== signingAccount || activeWallet !== signingWallet) throw new Error('The wallet changed. Please confirm again.');
      supplyStatus.textContent = 'Awaiting approval in Slush…';
      const signed = await feature.signAndExecuteTransaction({
        transaction: { toJSON: async () => result.transaction }, account: signingAccount, chain: 'sui:testnet',
      });
      digest = signed.digest;
      if (!digest) throw new Error('No transaction ID returned. Check wallet activity before retrying.');
      supplyStatus.textContent = 'Awaiting chain confirmation…';
      const confirmation = await fetch('/api/admin/transactions/' + encodeURIComponent(digest), { signal: AbortSignal.timeout(25000) });
      const outcome = await confirmation.json();
      if (!confirmation.ok || !outcome.success) throw new Error(outcome.error || 'Unable to confirm. Check the transaction before retrying.');
      supplyResult.textContent = 'Umbrella created. Bring it to a station for docking.';
      supplyResult.append(supplyTransactionLink(digest));
      supplyForm.reset();
      showToast('Umbrella created.');
      void refreshBalance();
    } catch (error) {
      supplyError.textContent = error.name === 'TimeoutError' ? 'Confirmation timed out. Check wallet activity before retrying.' : error.message || 'Unable to create umbrella. Please try again.';
      if (digest) supplyError.append(supplyTransactionLink(digest));
    } finally {
      supplyPending = false;
      renderSupplyAccess();
    }
  });
`;
