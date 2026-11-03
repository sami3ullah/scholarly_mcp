// A minimal MCP Apps host for the browser test: the SDK's AppBridge talks to the card
// view in an iframe, as Claude or another supporting client would.
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

interface HostWindow extends Window {
  opened: string[];
  ready: Promise<void>;
  sendResult: (structuredContent: unknown) => Promise<void>;
  setLocale: (locale: string) => Promise<void>;
}

const host = window as unknown as HostWindow;
host.opened = [];
const frame = document.getElementById('view') as HTMLIFrameElement;
const bridge = new AppBridge(
  null,
  { name: 'test-host', version: '1.0.0' },
  { openLinks: {} },
  { hostContext: { theme: 'light', locale: 'en-US' } },
);
bridge.onopenlink = ({ url }) => {
  host.opened.push(url);
  return Promise.resolve({});
};
host.ready = new Promise<void>((resolve) => {
  bridge.addEventListener('initialized', () => {
    resolve();
  });
});
host.sendResult = (structuredContent) =>
  bridge.sendToolResult({ content: [{ type: 'text', text: 'cards' }], structuredContent } as never);
host.setLocale = async (locale) => {
  await bridge.sendHostContextChange({ locale });
};
const window_ = frame.contentWindow;
if (window_ === null) throw new Error('no iframe window');
void bridge.connect(new PostMessageTransport(window_, window_));
