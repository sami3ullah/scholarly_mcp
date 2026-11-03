import { tokenSchema } from '@scholarly-mcp/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionTracker } from '../components/action-tracker';

const token = tokenSchema.parse('pSSYWKV6y282qdANYe86LA');
const DOI = '10.1055/a-1001';
const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);

beforeEach(() => {
  sessionStorage.clear();
  sendBeacon.mockClear();
  Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
});

function renderButtons() {
  return render(
    <ActionTracker token={token} doi={DOI}>
      <a href="#sign-in" data-action="sign_in">
        <span>Sign in</span>
      </a>
      <a href="#buy" data-action="buy">
        Buy
      </a>
      <a href="#elsewhere">Journal</a>
      <a href="#odd" data-action="subscribe">
        Odd
      </a>
    </ActionTracker>,
  );
}

async function bodies(): Promise<unknown[]> {
  return Promise.all(
    sendBeacon.mock.calls.map(async ([, blob]) => JSON.parse(await blob.text()) as unknown),
  );
}

describe('the action beacon', () => {
  it('sends the token, result and action of a clicked access button', async () => {
    renderButtons();
    fireEvent.click(screen.getByText('Sign in'));
    expect(sendBeacon.mock.calls[0]?.[0]).toBe('/mcp/landing/action');
    expect(await bodies()).toEqual([{ t: token, doi: DOI, action: 'sign_in' }]);
  });

  it('sends each action once per tab, even after a remount', async () => {
    renderButtons().unmount();
    renderButtons();
    fireEvent.click(screen.getByText('Buy'));
    fireEvent.click(screen.getByText('Buy'));
    fireEvent.click(screen.getByText('Sign in'));
    expect(await bodies()).toEqual([
      { t: token, doi: DOI, action: 'buy' },
      { t: token, doi: DOI, action: 'sign_in' },
    ]);
  });

  it('ignores links without a known action', () => {
    renderButtons();
    fireEvent.click(screen.getByText('Journal'));
    fireEvent.click(screen.getByText('Odd'));
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
