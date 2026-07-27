# frozen_string_literal: true

# DFS redesign 插件（阶段四新增）：为文章正文中缺少 width/height 的本地图片
# 注入真实像素尺寸，浏览器据此预留空间 → 消除图片加载导致的 CLS（布局抖动）。
#
# 为何用插件：图片引用写在 _posts（铁律不可改），且尺寸标注属于 Chirpy 的
# refactor-content.html（gem 文件，不宜 shadow）。构建期读取图片文件头是
# 唯一既不动内容、又不动主题源码的健壮方案。与既有 posts-lastmod-hook.rb 同类。
#
# 支持 PNG / JPEG / GIF（站内附件均为 PNG）。远程图片、SVG、已带尺寸者跳过。
# 还原：删除本文件即可。

module DfsImageDimensions
  module_function

  # 读取图片二进制头，返回 [width, height] 或 nil
  def read_size(path)
    return nil unless File.file?(path)

    File.open(path, 'rb') do |io|
      head = io.read(32) || ''
      return png_size(io, head) if head[0, 8].bytes == [137, 80, 78, 71, 13, 10, 26, 10]
      return gif_size(head) if head[0, 6] == 'GIF87a' || head[0, 6] == 'GIF89a'
      return jpeg_size(io) if head[0, 2].bytes == [0xFF, 0xD8]
    end
    nil
  rescue StandardError
    nil
  end

  def png_size(_io, head)
    # IHDR 宽高位于字节 16..23（大端）
    w = head[16, 4].unpack1('N')
    h = head[20, 4].unpack1('N')
    (w && h && w > 0 && h > 0) ? [w, h] : nil
  end

  def gif_size(head)
    # 逻辑屏幕宽高位于字节 6..9（小端）
    w = head[6, 2].unpack1('v')
    h = head[8, 2].unpack1('v')
    (w && h && w > 0 && h > 0) ? [w, h] : nil
  end

  def jpeg_size(io)
    io.rewind
    io.read(2) # SOI
    loop do
      byte = io.read(1)
      return nil unless byte

      next unless byte.unpack1('C') == 0xFF

      marker = io.read(1)
      return nil unless marker

      m = marker.unpack1('C')
      m = io.read(1).unpack1('C') while m == 0xFF # 跳过填充

      # SOF0..SOF15（排除 DHT/JPGA/DAC 等非 SOF）
      if (0xC0..0xCF).include?(m) && ![0xC4, 0xC8, 0xCC].include?(m)
        io.read(3) # length(2) + precision(1)
        h = io.read(2).unpack1('n')
        w = io.read(2).unpack1('n')
        return (w && h && w > 0 && h > 0) ? [w, h] : nil
      elsif [0xD8, 0xD9].include?(m) || (0xD0..0xD7).include?(m)
        next
      else
        len = io.read(2)
        return nil unless len

        io.seek(len.unpack1('n') - 2, IO::SEEK_CUR)
      end
    end
  rescue StandardError
    nil
  end

  IMG_TAG = /<img\b(?![^>]*\b(?:width|height)=)[^>]*?src=(["'])(.*?)\1[^>]*>/i

  def process(html, site)
    return html unless html&.include?('<img')

    baseurl = site.baseurl.to_s
    source = site.source
    first = true # 每篇首张本地内容图 = LCP 候选，提升加载优先级

    html.gsub(IMG_TAG) do |tag|
      src = Regexp.last_match(2)
      next tag if src.nil? || src.start_with?('http://', 'https://', '//', 'data:')
      next tag if src.end_with?('.svg')

      rel = src
      rel = rel.sub(/\A#{Regexp.escape(baseurl)}/, '') unless baseurl.empty?
      file = File.join(source, rel)

      size = read_size(file)
      next tag unless size

      # 注入 width/height + decoding=async；aspect 由浏览器据两者推导
      new_tag = tag.sub('<img', %(<img width="#{size[0]}" height="#{size[1]}" decoding="async"))

      if first
        first = false
        # 首图不 lazy、高优先级抓取 → 缩短 LCP 的 Load Delay
        new_tag = new_tag.sub(/\s+loading=(["'])lazy\1/i, '')
        new_tag = new_tag.sub('<img', '<img fetchpriority="high"')
      end

      new_tag
    end
  end
end

# 对 posts 与 pages 的最终渲染产物做后处理
Jekyll::Hooks.register %i[posts pages], :post_render do |doc|
  doc.output = DfsImageDimensions.process(doc.output, doc.site)
end
