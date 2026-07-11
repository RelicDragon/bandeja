import { describe, expect, it } from 'vitest';
import { splitChipLabel } from './splitChipLabel';

describe('splitChipLabel', () => {
  it('splits on explicit pipe for translator-controlled line breaks', () => {
    expect(splitChipLabel('Заброни|корт')).toEqual({ first: 'Заброни', second: 'корт' });
  });

  it('splits on first space', () => {
    expect(splitChipLabel('Book court')).toEqual({ first: 'Book', second: 'court' });
  });

  it('splits long single words across two lines', () => {
    expect(splitChipLabel('Забронировать')).toEqual({ first: 'Заброни', second: 'ровать' });
  });

  it('keeps short single words on one line', () => {
    expect(splitChipLabel('Reservar')).toEqual({ first: 'Reservar', second: null });
  });
});
