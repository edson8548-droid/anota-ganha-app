import { describe, expect, it } from 'vitest';
import { getTrialEndingAlertContent } from './TrialEndingAlert';

const localDate = (day, hour = 12) => new Date(2026, 6, day, hour, 0, 0);

describe('getTrialEndingAlertContent', () => {
  it.each([
    [17, 3, 'termina em 3 dias'],
    [18, 2, 'termina em 2 dias'],
    [19, 1, 'termina amanhã'],
  ])('avisa nos três dias anteriores ao fim', (currentDay, daysLeft, message) => {
    const result = getTrialEndingAlertContent(localDate(20), localDate(currentDay));

    expect(result).toMatchObject({ daysLeft });
    expect(result.message).toContain(message);
    expect(result.message).toContain('R$ 99,90');
  });

  it('mantém um último aviso no próprio dia antes do horário de encerramento', () => {
    const result = getTrialEndingAlertContent(localDate(20, 18), localDate(20, 8));

    expect(result).toMatchObject({ daysLeft: 0 });
    expect(result.message).toContain('termina hoje');
  });

  it('não avisa antes da janela nem depois do encerramento', () => {
    expect(getTrialEndingAlertContent(localDate(20), localDate(16))).toBeNull();
    expect(getTrialEndingAlertContent(localDate(20, 8), localDate(20, 9))).toBeNull();
  });
});
