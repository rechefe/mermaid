grammar SchematicGrammar

entry Schematic:
    NEWLINE*
    'schematic-beta'
    (NEWLINE+ statements+=SchStatement)*
    NEWLINE*
;

// Named SchStatement (rather than Statement) to avoid colliding with the
// unrelated `Statement` rule already declared by the gitGraph grammar.
SchStatement:
    SchDirection | PortDecl | ModuleDef | Instance | Connection
;

// Named SchDirection (rather than Direction) to avoid colliding with the
// unrelated `Direction` rule already declared by the gitGraph grammar — all
// mermaid grammars share one generated AST namespace (see langium-config.json).
SchDirection:
    'direction' dir=DirectionValue
;

DirectionValue returns string:
    'LR' | 'RL' | 'TB' | 'BT'
;

ModuleDef:
    'module' name=ID
        (NEWLINE+ members+=ModuleMember)*
    NEWLINE+ 'end'
;

ModuleMember:
    PortDecl | SchGroup
;

// Named SchGroup (rather than Group) to avoid colliding with the unrelated
// `Group` rule already declared by the architecture grammar.
SchGroup:
    'group' name=ID (side=Side)?
        (NEWLINE+ ports+=PortDecl)*
    NEWLINE+ 'end'
;

PortDecl:
    dir=PortDir name=ID (width=Width)? (':' kind=ID)? (side=Side)?
;

PortDir returns string:
    'in' | 'out' | 'inout'
;

Width:
    '[' msb=INT (':' lsb=INT)? ']'
;

Side:
    '@' value=SideValue
;

SideValue returns string:
    'left' | 'right' | 'top' | 'bottom'
;

Instance:
    type=ID name=ID
;

Connection:
    src=Endpoint links+=SchLink+
;

// Named SchLink (rather than Link) to avoid colliding with the unrelated
// `Link` rule already declared by the wardley grammar.
SchLink:
    arrow=ArrowToken target=Endpoint
;

ArrowToken returns string:
    SIGNAL_ARROW | BUS_ARROW | BIDIR_ARROW | CTRL_ARROW
;

Endpoint:
    node=ID ('.' port=ID)?
;

terminal BIDIR_ARROW:  '<-->';
terminal BUS_ARROW:    '==>';
terminal CTRL_ARROW:   '-.->';
terminal SIGNAL_ARROW: '-->';

terminal ID: /[A-Za-z_][A-Za-z0-9_$]*/;
terminal INT returns number: /[0-9]+/;

terminal NEWLINE: /[\t ]*(\r?\n)+[\t ]*/;
hidden terminal WS: /[\t ]+/;
hidden terminal COMMENT: /%%[^\n\r]*/;
