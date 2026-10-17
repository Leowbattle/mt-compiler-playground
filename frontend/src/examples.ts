export interface Example {
  name: string;
  needsInput: boolean;
  source: string;
}

/** Example programs from the cw2 coursework tests. */
export const examples: Example[] = [
  {
    name: 'fibonacci',
    needsInput: true,
    source: `let
    var x: Integer;
    var i: Integer;
    fun fib(n: Integer): Integer = n < 2 ? n : fib(n - 1) + fib(n - 2)
in
begin
    getint(x);
    i := 0;
    while i < x do
    begin
        printint(fib(i));
        i := i + 1
    end
end
`,
  },
  {
    name: 'fact',
    needsInput: true,
    source: `let
    fun fact (n:Integer) : Integer =
        n <= 0 ? 1 : n * fact (n-1);
    var x : Integer;
    var i : Integer := 1
in
begin
    getint(x);
    while i <= x do
    begin
        printint(fact(i));
        i := i + 1
    end
end
`,
  },
  {
    name: 'sqcb',
    needsInput: false,
    source: `let
    fun square (x: Integer) : Integer = x*x;
    fun cube (x: Integer) : Integer = x*square(x);
    fun sqcb (b: Boolean, x:Integer) : Integer =
        b ? square(x) : cube(x)
in
begin
    printint(sqcb(true,3));
    printint(sqcb(false,3))
end
`,
  },
  {
    name: 'test2',
    needsInput: false,
    source: `let
    fun func1 (a: Integer, b: Integer, c: Integer) : Integer = a;
    fun func2 (a: Integer, b: Integer, c: Integer) : Integer = b;
    fun func3 (a: Integer, b: Integer, c: Integer) : Integer = c
in
begin
    printint(func1(1, 2, 3));
    printint(func2(1, 2, 3));
    printint(func3(1, 2, 3))
end
`,
  },
  {
    name: 'add',
    needsInput: true,
    source: `let var x: Integer;
    var y: Integer
in
begin
    getint(x);
    getint(y);
    printint(x + y)
end
`,
  },
  {
    name: 'max',
    needsInput: true,
    source: `let var x: Integer;
    var y: Integer
in
begin
    getint(x);
    getint(y);

    if x > y then
        printint(x)
    else
        printint(y)
end
`,
  },
];
