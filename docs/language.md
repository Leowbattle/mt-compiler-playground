# MT Language Guide

MT is a small, statically typed procedural language. A program is a `let` block of
declarations followed by a single command. The two types are `Integer` and `Boolean`.

## Program shape

```mt
let
    var x: Integer := 3;
    fun square(n: Integer): Integer = n * n
in
begin
    printint(square(x))
end
```

Declarations and commands are separated by `;` (the final one can be omitted). Use
`begin ... end` to group multiple commands.

## Declarations

```mt
var x: Integer                 // uninitialised: 0
var ok: Boolean := true        // initialised
fun add(a: Integer, b: Integer): Integer = a + b
```

- `var name: Type` — defaults to `0` / `false`
- `var name: Type := expr`
- `fun name(arg: Type, ...): Type = expr` — the body is a single expression, and
  recursion is allowed

## Commands

| Command | Meaning |
|---|---|
| `x := expr` | assign |
| `if cond then cmd else cmd` | conditional command |
| `while cond do cmd` | loop |
| `getint(x)` | read one integer into `x` |
| `printint(expr)` | print an integer |
| `begin cmd; cmd; ... end` | block |

`if` and `while` conditions must be `Boolean`.

## Expressions

| Operator | Types | Result |
|---|---|---|
| `+ - * /` | `Integer` | `Integer` (`/` truncates) |
| `< <= > >=` | `Integer` | `Boolean` |
| `== !=` | same type on both sides | `Boolean` |
| `&&`, `\|\|` | `Boolean` | `Boolean` |
| `!` | `Boolean` | `Boolean` |
| unary `-` | `Integer` | `Integer` |
| `cond ? a : b` | `cond: Boolean`, branches same type | that type |

Precedence, high to low: unary `- !`, `* /`, `+ -`, comparisons, `&&`, `||`, `?:`.
Use parentheses when in doubt.

## Notes and quirks

- **No comments** — the parser doesn't support them.
- **No strings.** `printint` only takes an `Integer`; to print a boolean use
  `printint(b ? 1 : 0)`.
- **`?:` is an expression**, `if` is a command.
- **Integer division:** `7 / 2` is `3`; division by zero crashes the interpreter.
- **`getint` is interactive** — one integer per prompt.
- **Type errors are caught before running** — the playground shows them instead of
  executing.
- **Functions return a value, not a block** — there is no `return` statement.

## Examples

### Factorial

```mt
let
    fun fact(n: Integer): Integer =
        n <= 0 ? 1 : n * fact(n - 1);
    var x: Integer
in
begin
    getint(x);
    printint(fact(x))
end
```

### Fibonacci

```mt
let
    fun fib(n: Integer): Integer =
        n < 2 ? n : fib(n - 1) + fib(n - 2);
    var n: Integer
in
begin
    getint(n);
    printint(fib(n))
end
```

### Max of two

```mt
let
    var x: Integer;
    var y: Integer
in
begin
    getint(x);
    getint(y);
    if x > y then printint(x)
             else printint(y)
end
```
