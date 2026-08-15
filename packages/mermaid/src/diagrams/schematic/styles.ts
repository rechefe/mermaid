import type { DiagramStylesProvider } from '../../diagram-api/types.js';

const getStyles: DiagramStylesProvider = (options) =>
  `
  .schematic-port rect,
  .schematic-port path,
  .schematic-instance rect,
  .schematic-instance path {
    fill: ${options.mainBkg};
    stroke: ${options.nodeBorder};
    stroke-width: 1px;
  }

  .schematic-port .label,
  .schematic-instance .label {
    color: ${options.nodeTextColor || options.textColor};
  }

  /*
   * Nets are signal wires: uniform weight, no fill, so the schematic reads as a circuit.
   * The class lands on the <path> itself (there's no wrapping element to key a descendant
   * selector off), so this must be a plain class selector, not ".schematic-net path" — the
   * orthogonal step routing below closes into pockets when implicitly filled, so leaving the
   * descendant selector in place silently fell back to the SVG default fill: black and drew
   * every corner as a solid wedge instead of a thin line.
   */
  .schematic-net {
    stroke: ${options.lineColor};
    stroke-width: 1.5px;
    fill: none;
  }
`;

export default getStyles;
