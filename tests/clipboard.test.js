import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyText } from '../src/shared/clipboard.js';

test('clipboard failure is reported as failure when the fallback also fails', async () => {
    const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const oldDocument = globalThis.document;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied'); } } } });
    globalThis.document = { activeElement: null, body: { appendChild() {} }, createElement: () => ({ style: {}, select() {}, remove() {} }), execCommand: () => false };
    try { assert.equal(await copyText('test'), false); }
    finally { Object.defineProperty(globalThis, 'navigator', oldNavigator); globalThis.document = oldDocument; }
});
test('successful fallback is accepted when the clipboard API is unavailable', async () => {
    const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const oldDocument = globalThis.document;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    globalThis.document = { activeElement: null, body: { appendChild() {} }, createElement: () => ({ style: {}, select() {}, remove() {} }), execCommand: () => true };
    try { assert.equal(await copyText('test'), true); }
    finally { Object.defineProperty(globalThis, 'navigator', oldNavigator); globalThis.document = oldDocument; }
});
