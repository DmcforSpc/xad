// 当 DOM 内容完全加载后执行
document.addEventListener('DOMContentLoaded', function () {
  // 初始时获取原始标题
  const originalTitle = document.title;

  // 定义用户离开时显示的标题
  const awayMessage = '🥺 再见~';

  // 定义用户回来时显示的标题
  const welcomeMessage = '🥰 欢迎！';

  // 监听 visibilitychange 事件
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      // 用户切换到了其他页面
      document.title = awayMessage;
    } else {
      // 用户回来了
      document.title = welcomeMessage;

      // 2秒后恢复原始标题，给用户一个短暂的欢迎提示
      setTimeout(function () {
        document.title = originalTitle;
      }, 2000);
    }
  });
});
