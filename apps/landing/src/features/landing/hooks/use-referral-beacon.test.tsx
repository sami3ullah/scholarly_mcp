import { tokenSchema } from '@scholarly-mcp/core';
import { renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReferralBeacon } from './use-referral-beacon';

const token = tokenSchema.parse('pSSYWKV6y282qdANYe86LA');
const DOI = '10.1055/a-1001';
const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);

beforeEach(() => {
  sessionStorage.clear();
  sendBeacon.mockClear();
  Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(document, 'prerendering');
  Reflect.deleteProperty(document, 'referrer');
});

function arrivedFrom(referrer: string) {
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

async function sentBody(): Promise<unknown> {
  const blob = sendBeacon.mock.calls[0]?.[1];
  return blob === undefined ? undefined : JSON.parse(await blob.text());
}

describe('useReferralBeacon', () => {
  it('sends the token, result and tool once, even when React runs effects twice', async () => {
    const { rerender } = renderHook(
      () => {
        useReferralBeacon(token, DOI, 'search_articles');
      },
      { wrapper: strict },
    );
    rerender();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]?.[0]).toBe('/mcp/landing/visit');
    expect(await sentBody()).toEqual({ t: token, doi: DOI, tool: 'search_articles' });
  });

  it('does not send again after a reload in the same tab', () => {
    renderHook(() => {
      useReferralBeacon(token, DOI, undefined);
    }).unmount();
    renderHook(() => {
      useReferralBeacon(token, DOI, undefined);
    });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('sends nothing without a token', () => {
    renderHook(() => {
      useReferralBeacon(undefined, DOI, 'search_articles');
    });
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('waits until a prerendered page is actually shown', () => {
    Object.defineProperty(document, 'prerendering', { value: true, configurable: true });
    renderHook(() => {
      useReferralBeacon(token, DOI, undefined);
    });
    expect(sendBeacon).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('prerenderingchange'));
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('falls back to fetch with keepalive when sendBeacon refuses', () => {
    sendBeacon.mockReturnValueOnce(false);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    renderHook(() => {
      useReferralBeacon(token, DOI, undefined);
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
      useReferralBeacon(token, DOI, undefined);
    });
    rerender();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
  });

  it('counts another result of the same search opened from the chat', () => {
    renderHook(() => {
      useReferralBeacon(token, DOI, 'search_articles');
    });
    renderHook(() => {
      useReferralBeacon(token, '10.1055/a-1002', 'search_articles');
    });
    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });

  it('does not count a move to another result on this site', () => {
    arrivedFrom(`${window.location.origin}/mcp/landing?t=${token}&doi=${DOI}`);
    renderHook(() => {
      useReferralBeacon(token, '10.1055/a-1002', undefined);
    });
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('counts a link whose client stripped the UTM tags', () => {
    arrivedFrom('https://claude.ai/');
    renderHook(() => {
      useReferralBeacon(token, DOI, undefined);
    });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
