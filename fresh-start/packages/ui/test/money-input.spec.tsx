import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MoneyInput, type MoneyValue } from '../src/forms/MoneyInput';

/**
 * FW W7: a form that resets its amount after a command (the supplier bid form reloaded to
 * ₹0) must show the reset; the field used to keep the old text, so what was on screen was
 * not what was sent.
 */
function Harness({ onReady }: { onReady: (set: (v: MoneyValue | null) => void) => void }) {
  const [value, setValue] = useState<MoneyValue | null>({ amountMinor: 4850, currency: 'INR' });
  onReady(setValue);
  return <MoneyInput label="Price each" value={value} onChange={setValue} />;
}

describe('MoneyInput', () => {
  it('shows an amount set from outside while not focused', () => {
    let set: (v: MoneyValue | null) => void = () => undefined;
    render(<Harness onReady={(s) => (set = s)} />);
    const input = screen.getByLabelText('Price each') as HTMLInputElement;
    expect(input.value).toBe('48.50');
    act(() => set({ amountMinor: 0, currency: 'INR' }));
    expect(input.value).toBe('0.00');
  });

  it('never rewrites what the person is typing', () => {
    let set: (v: MoneyValue | null) => void = () => undefined;
    render(<Harness onReady={(s) => (set = s)} />);
    const input = screen.getByLabelText('Price each') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '52.5' } });
    expect(input.value).toBe('52.5');
    fireEvent.blur(input);
    expect(input.value).toBe('52.50');
    void set;
  });
});
