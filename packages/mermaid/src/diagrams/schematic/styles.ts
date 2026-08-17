import type { DiagramStylesProvider } from '../../diagram-api/types.js';
import { getConfig as getConfigAPI } from '../../config.js';
import { getThemeVariables } from '../../themes/theme-default.js';
import { cleanAndMerge } from '../../utils.js';
import { G } from './geometry.js';

export const styles: DiagramStylesProvider = () => {
  const defaultThemeVariables = getThemeVariables();
  const currentConfig = getConfigAPI();
  const t = cleanAndMerge(defaultThemeVariables, currentConfig.themeVariables) as unknown as Record<
    string,
    string
  >;

  return `
  .sch-body {
    fill: ${t.schematicBodyFill};
    stroke: ${t.schematicBodyStroke};
    stroke-width: ${G.STROKE_BODY};
  }
  .sch-title {
    fill: ${t.schematicTitleColor};
    font-size: ${G.TITLE_SIZE}px;
    font-weight: ${G.TITLE_WEIGHT};
  }
  .sch-caption {
    fill: ${t.schematicLabelColor};
    font-size: ${G.CAPTION_SIZE}px;
  }
  .sch-port-label {
    fill: ${t.schematicLabelColor};
    font-size: ${G.PORT_LABEL_SIZE}px;
  }
  .sch-terminal-label {
    fill: ${t.schematicTitleColor};
    font-size: ${G.PORT_LABEL_SIZE}px;
  }
  .sch-group-band {
    fill: ${t.schematicGroupFill};
  }
  .sch-group-label {
    fill: ${t.schematicGroupText};
    font-size: ${G.GROUP_LABEL_SIZE}px;
  }
  .sch-net {
    stroke: ${t.schematicNet};
    stroke-width: ${G.STROKE_NET};
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: butt;
  }
  .sch-bus {
    stroke: ${t.schematicBus};
    stroke-width: ${G.STROKE_BUS};
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: butt;
  }
  .sch-net-label {
    fill: ${t.schematicBus};
    font-size: ${G.NET_LABEL_SIZE}px;
  }
  .sch-lead {
    stroke: ${t.schematicBodyStroke};
    stroke-width: ${G.STROKE_BODY};
  }
  .sch-net-tip {
    fill: ${t.schematicNet};
  }
  .sch-bus-tip {
    fill: ${t.schematicBus};
  }
  `;
};

export default styles;
