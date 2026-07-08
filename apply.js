(function () {
  const form = document.querySelector("#applicationForm");
  const status = document.querySelector("#applicationStatus");
  if (!form || !status) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "正在提交...";
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("submit_failed");
      form.reset();
      status.textContent = "已提交。我们会筛选后联系你。";
    } catch (error) {
      status.textContent = "提交失败。请稍后再试。";
    }
  });
})();
