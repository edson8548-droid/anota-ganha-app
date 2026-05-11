import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import WhatsAppButton from './WhatsAppButton';

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  window.open = jest.fn();
});

afterEach(() => {
  if (root) {
    act(() => root.unmount());
  }
  document.body.removeChild(container);
  container = null;
  root = null;
  jest.restoreAllMocks();
});

test('abre link do WhatsApp com telefone e mensagem configurados', () => {
  act(() => {
    root = createRoot(container);
    root.render(
      <WhatsAppButton phoneNumber="5513999999999" message="Preciso de ajuda" />,
    );
  });

  const button = container.querySelector('button[aria-label="Abrir WhatsApp"]');
  expect(button).not.toBeNull();

  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(window.open).toHaveBeenCalledWith(
    'https://wa.me/5513999999999?text=Preciso%20de%20ajuda',
    '_blank',
    'noopener,noreferrer',
  );
});
