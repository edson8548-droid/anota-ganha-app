import { describe, expect, it } from 'vitest';
import { isTurbinadoIndustry } from './turbinado';

describe('isTurbinadoIndustry', () => {
  it.each(['Camil', 'Falcon', 'JDE', 'M. Dias Branco', 'Mondelez', 'Softys', 'Vigor', 'Ypê'])(
    'marca %s como Turbinado',
    name => expect(isTurbinadoIndustry(name)).toBe(true),
  );

  it('não marca indústria comum', () => {
    expect(isTurbinadoIndustry('Baston')).toBe(false);
  });
});
