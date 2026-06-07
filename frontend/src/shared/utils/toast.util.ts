let toastContainer: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.className = 'fixed top-4 right-4 z-[100] flex flex-col gap-2';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

function createToast(message: string, type: 'success' | 'error'): void {
  const container = getContainer();
  const el = document.createElement('div');

  const bgClass = type === 'success'
    ? 'bg-green-600 text-white'
    : 'bg-red-600 text-white';

  el.className = `${bgClass} px-4 py-3 rounded-md shadow-lg text-sm font-medium transition-all duration-300 translate-x-full opacity-0`;
  el.textContent = message;

  container.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.remove('translate-x-full', 'opacity-0');
  });

  setTimeout(() => {
    el.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

export const toast = {
  success: (message: string) => createToast(message, 'success'),
  error: (message: string) => createToast(message, 'error'),
};
