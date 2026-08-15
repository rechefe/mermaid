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

  /* Nets are signal wires: uniform weight, no fill, so the schematic reads as a circuit. */
  .schematic-net path {
    stroke: ${options.lineColor};
    stroke-width: 1.5px;
    fill: none;
  }

  .schematic-net marker {
    fill: ${options.lineColor};
    stroke: ${options.lineColor};
  }
`;

export default getStyles;
