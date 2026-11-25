export default {
  language: 'java',
  probe: ['javac', ['-version']],
  options: { mainClass: 'Main', initialFile: 'Main.java' },
  cases: [
    {
      name: 'prints output',
      files: { 'Main.java': 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("hello from java");\n  }\n}\n' },
      expect: { phase: 'finished', output: 'hello from java' },
    },
    {
      name: 'reports a compile error',
      files: { 'Main.java': 'public class Main {\n  public static void main(String[] args) {\n    missing();\n  }\n}\n' },
      expect: { phase: 'compile-error', diagnostic: { file: 'Main.java', line: 3, severity: 'error' } },
    },
    {
      name: 'reports a runtime error',
      files: { 'Main.java': 'public class Main {\n  public static void main(String[] args) {\n    int[] values = new int[2];\n    System.out.println(values[4]);\n  }\n}\n' },
      expect: { phase: 'error', diagnostic: { file: 'Main.java', line: 4 } },
    },
  ],
}
