export const supplyMarkup = /* html */ `
  <button type="button" id="supply-open" class="umbrella-action" aria-haspopup="dialog" aria-controls="supply-dialog" disabled>Create umbrella</button>
  <p id="supply-access" role="status">Connect Slush Wallet to create an umbrella on testnet.</p>
  <p id="supply-result" role="status"></p>
`;

export const supplyOverlay = /* html */ `
  <dialog id="supply-dialog" aria-labelledby="supply-dialog-title" aria-describedby="supply-dialog-description">
  <form id="supply-form">
    <h2 id="supply-dialog-title">Create umbrella</h2>
    <p id="supply-dialog-description">Register an umbrella to supply to a station.</p>
    <label class="admin-field" for="umbrella-color">Color
      <select id="umbrella-color" name="color" required>
        <option value="">Choose a color</option>
        <option value="0">Vinyl</option>
        <option value="1">Black</option>
        <option value="2">White</option>
      </select>
    </label>
    <p>A 0.03 SUI condition bond is held by the contract. You also pay network gas fees. After creation, bring the umbrella to a station for docking.</p>
    <div class="modal-actions">
      <button type="button" id="supply-cancel">Cancel</button>
      <button type="submit" id="supply-confirm" disabled>Create umbrella</button>
    </div>
    <p id="supply-status" role="status" aria-live="polite">Connect Slush Wallet to create an umbrella on testnet.</p>
    <p id="supply-error" role="alert"></p>
  </form>
  </dialog>
`;

export const supplyScript = /* js */ `
  const supplyDialog = document.getElementById('supply-dialog');
  const supplyOpen = document.getElementById('supply-open');
  const supplyCancel = document.getElementById('supply-cancel');
  const supplyAccess = document.getElementById('supply-access');
  const supplyForm = document.getElementById('supply-form');
  const supplyConfirm = document.getElementById('supply-confirm');
  const supplyColor = document.getElementById('umbrella-color');
  const supplyStatus = document.getElementById('supply-status');
  const supplyError = document.getElementById('supply-error');
  const supplyResult = document.getElementById('supply-result');
  let supplyPending = false;
  function renderSupplyAccess() {
    supplyOpen.disabled = supplyPending || !account;
    supplyCancel.disabled = supplyPending;
    supplyAccess.textContent = account ? 'Testnet · 0.03 SUI bond + gas' : 'Connect Slush Wallet to create an umbrella on testnet.';
    if (!account && !supplyPending && supplyDialog.open) supplyDialog.close();
    supplyConfirm.disabled = supplyPending || !account;
    supplyColor.disabled = supplyPending;
    supplyConfirm.textContent = supplyPending ? 'Creating…' : 'Create umbrella';
    supplyForm.setAttribute('aria-busy', String(supplyPending));
    if (!supplyPending) supplyStatus.textContent = account ? 'Testnet · 0.03 SUI bond + gas' : 'Connect Slush Wallet to create an umbrella on testnet.';
  }
  supplyOpen.addEventListener('click', () => {
    if (supplyPending || !account) return;
    supplyForm.reset();
    supplyError.textContent = '';
    renderSupplyAccess();
    supplyDialog.showModal();
  });
  supplyCancel.addEventListener('click', () => { if (!supplyPending) supplyDialog.close(); });
  supplyDialog.addEventListener('cancel', event => { if (supplyPending) event.preventDefault(); });
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
      supplyDialog.close();
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
