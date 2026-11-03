import { tokenSchema } from '@scholarly-mcp/core';
import { renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReferralBeacon } from './use-referral-beacon';

const token = tokenSchema.parse('pSSYWKV6y282qdANYe86LA');
const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);

beforeEach(() => {
  sessionStorage.clear();
  sendBeacon.mockClear();
  Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(document, 'prerendering');
});

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

async function sentBody(): Promise<unknown> {
  const blob = sendBeacon.mock.calls[0]?.[1];
  return blob === undefined ? undefined : JSON.parse(await blob.text());
}

describe('useReferralBeacon', () => {
  it('sends the token and tool once, even when React runs effects twice', async () => {
    const { rerender } = renderHook(
      () => {
        useReferralBeacon(token, 'search_articles');
      },
      { wrapper: strict },
    );
    rerender();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]?.[0]).toBe('/mcp/landing/visit');
    expect(await sentBody()).toEqual({ t: token, tool: 'search_articles' });
  });

  it('does not send again after a reload in the same tab', () => {
    renderHook(() => {
      useReferralBeacon(token, undefined);
    }).unmount();
    renderHook(() => {
      useReferralBeacon(token, undefined);
    });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('sends nothing without a token', () => {
    renderHook(() => {
      useReferralBeacon(undefined, 'search_articles');
    });
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('waits until a prerendered page is actually shown', () => {
    Object.defineProperty(document, 'prerendering', { value: true, configurable: true });
    renderHook(() => {
      useReferralBeacon(token, undefined);
    });
    expect(sendBeacon).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('prerenderingchange'));
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('falls back to fetch with keepalive when sendBeacon refuses', () => {
    sendBeacon.mockReturnValueOnce(false);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    renderHook(() => {
      useReferralBeacon(token, undefined);
    });
    expect(fetch).toHaveBeenCalledWith(
      '/mcp/landing/visit',
      expect.objectContaining({ keepalive: true }),
    );
    fetch.mockRestore();
  });

  it('still sends once when storage is blocked', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { rerender } = renderHook(() => {
      useReferralBeacon(token, undefined);
    });
    rerender();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
  });
});
