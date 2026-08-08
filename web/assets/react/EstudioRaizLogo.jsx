/**
 * EstudioRaizLogo
 * ---------------------------------------------------------------
 * Isotipo de Estudio Raíz como componente React reutilizable.
 * Sin dependencias: devuelve un <svg> inline, por lo que hereda
 * tamaño y color del contexto y se puede animar con CSS.
 *
 * Paleta del manual de marca:
 *   #0D2B3E  azul profundo
 *   #5A6B3F  verde oliva
 *   #F2EFE7  crema
 *
 * Uso:
 *   <EstudioRaizLogo />                         // fondo claro, 120 px
 *   <EstudioRaizLogo variant="dark" size={64} />
 *   <EstudioRaizLogo variant="favicon" size={32} />
 *   <EstudioRaizLogo variant="mono" />
 *   <EstudioRaizLogo strokeColor="#123" leafColor="#456" />
 *   <EstudioRaizLogo size="100%" title="Volver al inicio" />
 */

const VARIANTS = {
  light:   { stroke: '#0D2B3E', leaf: '#5A6B3F' },
  dark:    { stroke: '#FFFFFF', leaf: '#9BC9B5' },
  favicon: { stroke: '#0D2B3E', leaf: '#5A6B3F' },
  mono:    { stroke: '#0D2B3E', leaf: '#0D2B3E' },
};

// Trazado de la hoja lanceolada: nace en (0,0), apunta hacia +X, largo 100.
const HOJA = 'M0 0 C 24 -25, 64 -27, 100 0 C 64 27, 24 25, 0 0 Z';

// Posición de cada hoja: [x, y, rotación, escala]
const HOJAS_COMPLETO = [
  [500, 278, -90, 1.72],
  [386, 320, 220, 1.5],
  [614, 320, -40, 1.5],
  [312, 452, 205, 1.42],
  [688, 452, -25, 1.42],
  [256, 553, 192, 1.32],
  [744, 553, -12, 1.32],
];

const HOJAS_FAVICON = [
  [500, 286, -90, 1.95],
  [466, 356, 218, 1.72],
  [534, 356, -38, 1.72],
  [240, 566, 194, 1.55],
  [760, 566, -14, 1.55],
];

export default function EstudioRaizLogo({
  variant = 'light',
  size = 120,
  strokeColor,
  leafColor,
  title = 'Estudio Raíz',
  className,
  ...rest
}) {
  const preset = VARIANTS[variant] || VARIANTS.light;
  const stroke = strokeColor || preset.stroke;
  const leaf = leafColor || preset.leaf;
  const esFavicon = variant === 'favicon';
  const hojas = esFavicon ? HOJAS_FAVICON : HOJAS_COMPLETO;

  return (
    <svg
      viewBox="0 0 1000 1000"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <title>{title}</title>

      <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
        {esFavicon ? (
          <>
            {/* Raíces simplificadas */}
            <path d="M500 782 C 500 818, 500 852, 500 884" strokeWidth="20" />
            <path d="M492 782 C 470 812, 432 842, 388 862" strokeWidth="18" />
            <path d="M508 782 C 530 812, 568 842, 612 862" strokeWidth="18" />
            {/* Línea de tierra */}
            <path d="M150 784 L850 784" strokeWidth="14" strokeOpacity="0.55" />
            {/* Tronco */}
            <path d="M500 782 L500 296" strokeWidth="30" />
            {/* Ramas principales */}
            <path d="M470 352 C 376 372, 232 468, 232 616 C 232 710, 330 768, 446 784" strokeWidth="42" />
            <path d="M530 352 C 624 372, 768 468, 768 616 C 768 710, 670 768, 554 784" strokeWidth="42" />
          </>
        ) : (
          <>
            {/* Raíces: protección y base sólida */}
            <path d="M500 780 C 500 812, 500 848, 500 878" strokeWidth="8" />
            <path d="M498 780 C 490 814, 478 850, 462 886" strokeWidth="8" />
            <path d="M502 780 C 510 814, 522 850, 538 886" strokeWidth="8" />
            <path d="M496 782 C 474 810, 438 840, 396 862" strokeWidth="7" />
            <path d="M504 782 C 526 810, 562 840, 604 862" strokeWidth="7" />
            <path d="M494 784 C 462 798, 408 814, 344 822" strokeWidth="6" />
            <path d="M506 784 C 538 798, 592 814, 656 822" strokeWidth="6" />
            {/* Línea de tierra */}
            <path d="M106 784 L894 784" strokeWidth="6" strokeOpacity="0.55" />
            {/* Tronco: dos trazos que convergen en punta */}
            <path d="M494 782 C 495 620, 498 420, 500 288" strokeWidth="13" />
            <path d="M506 782 C 505 620, 502 420, 500 288" strokeWidth="13" />
            {/* Ramas principales */}
            <path d="M478 366 C 390 382, 252 470, 252 612 C 252 702, 342 762, 452 780" strokeWidth="24" />
            <path d="M522 366 C 610 382, 748 470, 748 612 C 748 702, 658 762, 548 780" strokeWidth="24" />
            {/* Ramas secundarias */}
            <path d="M500 348 C 468 344, 428 334, 386 320" strokeWidth="7" />
            <path d="M500 348 C 532 344, 572 334, 614 320" strokeWidth="7" />
          </>
        )}
      </g>

      {/* Hojas: crecimiento y expansión */}
      <g fill={leaf} stroke="none">
        {hojas.map(([x, y, rot, esc], i) => (
          <path key={i} d={HOJA} transform={`translate(${x} ${y}) rotate(${rot}) scale(${esc})`} />
        ))}
      </g>
    </svg>
  );
}
