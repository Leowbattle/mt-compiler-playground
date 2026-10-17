export function mountAbout(): void {
  const button = document.querySelector<HTMLButtonElement>('#about');
  const dialog = document.querySelector<HTMLDialogElement>('#about-dialog');
  if (!button || !dialog) return;

  button.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });

  // Clicking the backdrop (the dialog element itself) closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
