import type { ShootingHand } from '@shot-ai/contracts';

interface HandSelectorProps {
  value: ShootingHand | '';
  onChange: (value: ShootingHand) => void;
  label?: string;
}

export function HandSelector({ value, onChange, label = '投篮手' }: HandSelectorProps) {
  return (
    <fieldset className="field hand-field">
      <legend>{label}</legend>
      <div className="segmented-control">
        {(['right', 'left'] as const).map((hand) => (
          <label key={hand} className={value === hand ? 'is-selected' : ''}>
            <input
              type="radio"
              name="shootingHand"
              value={hand}
              checked={value === hand}
              onChange={() => onChange(hand)}
            />
            <span>{hand === 'right' ? '右手' : '左手'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
