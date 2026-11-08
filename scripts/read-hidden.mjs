import { emitKeypressEvents } from "node:readline";

export function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("请在本机交互式终端运行此程序，以便隐藏输入。");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const wasRaw = input.isRaw;
    process.stdout.write(`${prompt}：`);
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.off("keypress", onKey);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === "c") return finish(new Error("输入已取消。"));
      if (key.name === "return" || key.name === "enter") return finish();
      if (key.name === "backspace") {
        value = Array.from(value).slice(0, -1).join("");
      } else if (!key.ctrl && !key.meta && text && !/[\u0000-\u001f\u007f]/u.test(text)) {
        value += text;
      }
    };
    input.on("keypress", onKey);
  });
}
