# Schematic Diagram (beta)

## Introduction

A schematic diagram draws digital-logic-style hardware schematics: top-level
ports, component instances (boolean logic gates or arbitrary named
components), and the point-to-point connections between them. Layout is
computed automatically with orthogonal routing.

## Syntax

A schematic diagram starts with `schematic-beta`.

```
schematic-beta
  direction LR
  in a
  in b
  out y

  and g1
  a  --> g1
  b  --> g1
  g1 --> y
```

### Direction

`direction` sets the overall flow of the diagram and may be `LR`, `RL`, `TB`,
or `BT`. It defaults to `LR`.

### Ports

Top-level ports are declared with `in`, `out`, or `inout`, followed by a
name. A port may optionally declare a bit width (`a[7:0]` or `a[8]`), a
`kind` (e.g. `: clock`), and a side (`@left`, `@right`, `@top`, `@bottom`).

### Instances

`<Type> <name>` declares an instance. `<Type>` is either one of the built-in
primitive gates (`and`, `nand`, `or`, `nor`, `xor`, `xnor`, `not`, `buf`) or
the name of a `module` declared earlier in the diagram. Any other type name
is still legal — it renders as a plain labelled box with no declared ports.

### Connections

`src --> dst` connects two endpoints. Connections may be chained
(`a --> b --> c`) and endpoints may reference a specific port on an instance
with `instance.port`.

### Modules

`module <Name> ... end` declares a reusable interface — a named set of ports
(and port groups) that an instance of that name renders with.

```
module ALU
  in  a
  in  b
  out y
end
```

### Groups

Inside a `module`, `group <name> [@side] ... end` clusters a contiguous run
of ports and renders them together with a labelled band along the module's
edge.

```
module Producer
  group m_axis @right
    out tvalid
    in  tready
    out tdata
  end
end
```

### Comments

`%%` starts a comment that runs to the end of the line.

## Examples

### Primitives

```mermaid-example
schematic-beta
  in a
  in b
  out y

  and g1
  a  --> g1
  b  --> g1
  g1 --> y
```

### Modules and sides

```mermaid-example
schematic-beta
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
```

### Groups

```mermaid-example
schematic-beta
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
```

### Widths

```mermaid-example
schematic-beta
  in  a[7:0]
  out y[7:0]

  module Buf8
    in  d[7:0]
    out q[7:0]
  end

  Buf8 u0
  a --> u0.d
  u0.q --> y
```

## Notes

- `mux`, `dff`, and other non-boolean primitive names are not yet built-in
  glyphs — instances of those types render as plain labelled boxes.
- `==>`, `<-->`, and `-.->` are tokenised but not yet supported — using them
  is an error.
- Buses (`bus X`), interfaces/modports, expression sugar, slices on
  connections, nested instances inside a module body, and collapse/expand
  are not supported in this release.

## Configuration

Please refer to the [configuration](/config/schema-docs/config-defs-schematic-diagram-config.html) guide for details.
