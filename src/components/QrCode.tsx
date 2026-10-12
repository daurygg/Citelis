// QR como SVG vectorial (sin <img> ni canvas): se imprime nítido a cualquier tamaño en la
// térmica. Los módulos se dibujan con UN solo <path> de cuadritos enteros y
// `crispEdges`, sin suavizado. Corrección de errores "M" y 2 módulos de margen blanco.
import qrcode from 'qrcode-generator';

const MARGIN = 2;

export function QrCode({ value, label, sizeMm = 30 }: { value: string; label: string; sizeMm?: number }) {
  const qr = qrcode(0, 'M'); // 0 = elige solo el tamaño mínimo que cabe
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) d += `M${col + MARGIN} ${row + MARGIN}h1v1h-1z`;
    }
  }
  const size = n + MARGIN * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
