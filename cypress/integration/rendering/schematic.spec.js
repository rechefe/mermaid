import { imgSnapshotTest } from '../../helpers/util.ts';

describe('schematic', () => {
  it('should render fixture A (primitives)', () => {
    imgSnapshotTest(
      `schematic-beta
  in a
  in b
  out y

  and g1
  a  --> g1
  b  --> g1
  g1 --> y
`
    );
  });

  it('should render fixture B (modules and sides)', () => {
    imgSnapshotTest(
      `schematic-beta
  direction LR

  in  clk : clock
  in  a
  in  b
  out q

  module ALU
    in  a
    in  b
    out y
  end

  module Reg8
    in  clk : clock
    in  d
    out q
  end

  ALU  u_alu
  Reg8 u_q

  a --> u_alu.a
  b --> u_alu.b
  u_alu.y --> u_q.d
  clk --> u_q.clk
  u_q.q --> q
`
    );
  });

  it('should render fixture C (groups)', () => {
    imgSnapshotTest(
      `schematic-beta
  direction LR

  module Producer
    group m_axis @right
      out tvalid
      in  tready
      out tdata
    end
  end

  module Consumer
    group s_axis @left
      in  tvalid
      out tready
      in  tdata
    end
  end

  Producer u_src
  Consumer u_sink

  u_src.tvalid  --> u_sink.tvalid
  u_sink.tready --> u_src.tready
  u_src.tdata   --> u_sink.tdata
`
    );
  });

  it('should render fixture D (widths)', () => {
    imgSnapshotTest(
      `schematic-beta
  in  a[7:0]
  out y[7:0]

  module Buf8
    in  d[7:0]
    out q[7:0]
  end

  Buf8 u0
  a --> u0.d
  u0.q --> y
`
    );
  });
});
