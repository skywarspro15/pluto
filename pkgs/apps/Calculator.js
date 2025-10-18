export default {
  name: "Calculator",
  description: "Add, subtract, multiply, and divide numbers!",
  ver: "v1.6.2", // Supports minimum Core version of v1.6.2
  type: "process",
  exec: async function (Root) {
    let wrapper; // Lib.html | undefined
    let CalcWindow;

    console.log("Hello from example package", Root.Lib);

    const Win = (await Root.Lib.loadLibrary("WindowSystem")).win;
    const Html = Root.Lib.html;

    // Animation styles
    const styleId = "calculator-animation-styles";
    if (!document.getElementById(styleId)) {
      const animationStyles = `
        @keyframes calc-pop-in {
          from {
            transform: translateY(5px) scale(0.98);
            opacity: 0.6;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        .calc-display-animate {
          animation: calc-pop-in 0.15s var(--easing-function) forwards;
        }
      `;
      new Html("style")
        .attr({ id: styleId, type: "text/css" })
        .html(animationStyles)
        .appendTo(document.head);
    }

    CalcWindow = new Win({
      title: "Calculator",
      pid: Root.PID,
      width: 280,
      height: 380,
      minWidth: 240,
      minHeight: 320,
      onclose: () => {
        Root.Lib.onEnd();
      },
    });

    Root.Lib.setOnEnd((_) => CalcWindow.close());

    wrapper = CalcWindow.window.querySelector(".win-content");
    wrapper = Html.from(wrapper);

    wrapper.style({
      display: "grid",
      height: "100%",
      padding: "10px",
      gap: "8px",
      "grid-template-rows": "auto 1fr 1fr 1fr 1fr 1fr",
      "grid-template-columns": "repeat(4, 1fr)",
      "grid-template-areas": `
        "display display display display"
        "clear backspace dot divide"
        "seven eight nine multiply"
        "four five six subtract"
        "one two three add"
        "zero zero equals equals"
      `,
    });

    let calculation = "";

    let output = new Root.Lib.html("input")
      .attr({ readonly: true, placeholder: "0" })
      .style({
        "grid-area": "display",
        "font-size": "2.5em",
        "text-align": "right",
        padding: "0 10px",
        border: "none",
        "background-color": "transparent",
        margin: "0",
        "margin-bottom": "8px",
        color: "var(--text)",
        height: "auto",
        "min-height": "50px",
      })
      .appendTo(wrapper);

    function updateDisplay(value) {
      output.classOff("calc-display-animate");

      setTimeout(() => {
        output.val(value);
        output.classOn("calc-display-animate");
      }, 0);
    }

    function refreshOutput() {
      updateDisplay(calculation);
    }

    function appendToCalc(val) {
      const parts = calculation.split(/[\+\-\*\/]/);
      if (val === "." && parts[parts.length - 1].includes(".")) {
        return;
      }
      calculation += val;
      refreshOutput();
    }

    function clearCalc() {
      calculation = "";
      updateDisplay(""); // Use updateDisplay to animate the clear
    }

    function backspace() {
      calculation = calculation.slice(0, -1);
      refreshOutput();
    }

    function calculate() {
      if (calculation === "") return;
      try {
        const sanitizedCalc = calculation.replace(/[^-()\d/*+.]/g, "");
        if (sanitizedCalc === "") return;

        let result = eval(sanitizedCalc);
        result = parseFloat(result.toPrecision(14));
        calculation = result.toString();
        updateDisplay(calculation);
      } catch (e) {
        updateDisplay("Error");
        calculation = "";
      }
    }

    Html.from(CalcWindow.window).on("keydown", (e) => {
      e.preventDefault();
      const key = e.key;

      if (key >= "0" && key <= "9") appendToCalc(key);
      else if (["+", "-", "*", "/", "."].includes(key)) appendToCalc(key);
      else {
        switch (key) {
          case "Enter":
          case "=":
            calculate();
            break;
          case "Backspace":
            backspace();
            break;
          case "Escape":
          case "c":
          case "C":
            clearCalc();
            break;
        }
      }
    });

    const buttonConfig = [
      { text: "C", area: "clear", classList: ["op-alt"], action: clearCalc },
      {
        text: "⌫",
        area: "backspace",
        classList: ["op-alt"],
        action: backspace,
      },
      {
        text: ".",
        area: "dot",
        classList: ["op-alt"],
        action: () => appendToCalc("."),
      },
      {
        text: "÷",
        area: "divide",
        classList: ["op"],
        action: () => appendToCalc("/"),
      },
      { text: "7", area: "seven", action: () => appendToCalc("7") },
      { text: "8", area: "eight", action: () => appendToCalc("8") },
      { text: "9", area: "nine", action: () => appendToCalc("9") },
      {
        text: "×",
        area: "multiply",
        classList: ["op"],
        action: () => appendToCalc("*"),
      },
      { text: "4", area: "four", action: () => appendToCalc("4") },
      { text: "5", area: "five", action: () => appendToCalc("5") },
      { text: "6", area: "six", action: () => appendToCalc("6") },
      {
        text: "−",
        area: "subtract",
        classList: ["op"],
        action: () => appendToCalc("-"),
      },
      { text: "1", area: "one", action: () => appendToCalc("1") },
      { text: "2", area: "two", action: () => appendToCalc("2") },
      { text: "3", area: "three", action: () => appendToCalc("3") },
      {
        text: "+",
        area: "add",
        classList: ["op"],
        action: () => appendToCalc("+"),
      },
      { text: "0", area: "zero", action: () => appendToCalc("0") },
      { text: "=", area: "equals", classList: ["primary"], action: calculate },
    ];

    buttonConfig.forEach((btn) => {
      const buttonEl = new Html("button")
        .text(btn.text)
        .style({ "grid-area": btn.area, "font-size": "1.2em", margin: "0" })
        .on("click", btn.action)
        .appendTo(wrapper);

      if (btn.classList) buttonEl.classOn(...btn.classList);

      if (btn.classList?.includes("op"))
        buttonEl.style({
          "background-color": "var(--primary)",
          color: "var(--text-light)",
        });
      if (btn.classList?.includes("op-alt"))
        buttonEl.style({ "background-color": "var(--neutral-focus)" });
    });

    return Root.Lib.setupReturns((m) => {
      console.log("Example received message: " + m);
    });
  },
};
