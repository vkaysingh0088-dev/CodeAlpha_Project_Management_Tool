const COLORS = ['#1F4D3F', '#8A4B2D', '#3C4F8A', '#7A3E6B', '#5B6B1F', '#2F6B7A'];

export default function Avatar({ name = '?', size = 24 }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const color = COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <span className="avatar" title={name} style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {initials}
    </span>
  );
}
