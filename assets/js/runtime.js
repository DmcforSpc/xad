document.addEventListener('DOMContentLoaded', function () {
  const siteStart = new Date('2025-08-01T00:00:00Z'); // 修改为你实际的 start_date

  function updateRuntime() {
    const now = new Date();
    let diff = Math.floor((now - siteStart) / 1000);

    const days = Math.floor(diff / 86400);
    diff %= 86400;
    const hours = Math.floor(diff / 3600);
    diff %= 3600;
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;

    document.getElementById('runtime_days').textContent = days;
    document.getElementById('runtime_hours').textContent = hours;
    document.getElementById('runtime_minutes').textContent = minutes;
    document.getElementById('runtime_seconds').textContent = seconds;
  }

  updateRuntime();
  setInterval(updateRuntime, 1000);
});
