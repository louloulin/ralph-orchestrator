#!/usr/bin/env python3
"""
测试脚本：验证 Ralph 在处理包含中文字符的 prompt 时的 UTF-8 安全性

这个脚本模拟 Ralph 可能遇到的场景，并验证修复是否有效。
"""

def test_utf8_truncation():
    """测试 UTF-8 字符边界安全的截断"""

    # 测试字符串：包含中文字符的 prompt
    prompt = "Migrate TranslateFlow to Mastra + React + shadcn/ui 实现存在问题，充分复用mastra库 优先完善整个代码结构，分析存在的问题"

    print("=" * 80)
    print("UTF-8 字符边界安全性测试")
    print("=" * 80)
    print(f"\n原始 prompt: {prompt}")
    print(f"字符数: {len(prompt)}")
    print(f"字节数: {len(prompt.encode('utf-8'))}")

    # 问题代码模拟
    print("\n" + "=" * 80)
    print("❌ 不安全的字节索引（会导致 panic）")
    print("=" * 80)

    try:
        # 这是 main.rs 中有问题的代码
        truncated = prompt[:100] + "..."
        print(f"结果: {truncated}")
        print("⚠️  这会 panic 如果字节 100 落在多字节字符中间！")
    except Exception as e:
        print(f"❌ 错误: {e}")

    # 正确的实现
    print("\n" + "=" * 80)
    print("✅ 安全的字符边界截断")
    print("=" * 80)

    # 方法 1: 使用 floor_char_boundary
    def floor_char_boundary(s: str, index: int) -> int:
        """找到 <= index 的最大字符边界"""
        if index >= len(s.encode('utf-8')):
            return len(s)
        boundary = index
        while boundary > 0 and not s.is_char_boundary(boundary):
            boundary -= 1
        return boundary

    safe_index = floor_char_boundary(prompt, 100)
    safe_truncated = prompt[:safe_index] + "..."
    print(f"结果: {safe_truncated}")
    print(f"安全索引: {safe_index} (字节 {safe_index} = 字符位置)")

    # 方法 2: 使用字符计数
    char_index = 100
    char_boundary = prompt.encode('utf-8')[char_index:char_index+1] if char_index < len(prompt) else b''
    # 使用 char_indices 找到安全的字节索引
    for byte_idx, _ in enumerate(prompt.encode('utf-8')):
        if byte_idx >= 100:
            # 找到第 100 个字符的字节位置
            pass
    # 简化：使用 Python 的模拟
    char_count = 0
    byte_idx = 0
    for char in prompt:
        char_bytes = len(char.encode('utf-8'))
        if byte_idx + char_bytes > 100:
            break
        byte_idx += char_bytes
        char_count += 1

    char_truncated = prompt[:byte_idx] + "..."
    print(f"\n按字符数截断 (100 字符): {char_truncated}")

    return True


def analyze_error_scenario():
    """分析实际错误场景"""

    print("\n" + "=" * 80)
    print("实际错误场景分析")
    print("=" * 80)

    # 模拟文件内容
    file_content = "Migrate TranslateFlow to Mastra + React + shadcn/ui 实现存在问题，充分复用mastra库 优先完善整个代码结构，分析存在的问题"

    print(f"\n文件内容: {file_content}")
    print(f"字节长度: {len(file_content.encode('utf-8'))}")
    print(f"字符长度: {len(file_content)}")

    # 找出字节位置 98-101 的字符
    byte_98_101 = file_content.encode('utf-8')[98:102]
    char_at_98_101 = byte_98_101.decode('utf-8', errors='replace')
    print(f"\n字节 98-101: {byte_98_101!r}")
    print(f"解码字符: {char_at_98_98_101!r}")
    print(f"字符名: {char_at_98_98_98_101}")

    # 分析为什么错误信息说的是 '先' 而不是 '优'
    print("\n" + "-" * 80)
    print("错误信息分析:")
    print("-" * 80)

    # 找出 '先' 字符的位置
    for i, char in enumerate(file_content):
        if char == '先':
            start_byte = len(file_content[:i].encode('utf-8'))
            end_byte = len(file_content[:i+1].encode('utf-8'))
            print(f"'先' 在字符位置 {i}, 字节位置 {start_byte}-{end_byte}")

            if start_byte <= 100 <= end_byte:
                print(f"  ✅ 错误信息正确：字节 100 确实在 '先' 内部")
            else:
                print(f"  ❌ 错误信息有误：字节 100 不在 '先' 范围")
            break

    # 找出字节位置 100 的字符
    for i, char in enumerate(file_content):
        start_byte = len(file_content[:i].encode('utf-8'))
        end_byte = len(file_content[:i+1].encode('utf-8'))
        if start_byte <= 100 < end_byte:
            print(f"\n字节 100 在字符位置 {i}: {char!r} (字节 {start_byte}-{end_byte})")

            if char == '先':
                print(f"  ✅ 确认是 '先' 字符")
            elif char == '优':
                print(f"  ⚠️  但实际可能是 '优' 字符 (需要验证)")
            break


def generate_fix_recommendations():
    """生成修复建议"""

    print("\n" + "=" * 80)
    print("修复建议")
    print("=" * 80)

    print("""
1. 立即修复 (P0 - 关键):

   文件: crates/ralph-cli/src/main.rs

   第 1266 行 (prompt_summary 截断):
   ```rust
   // ❌ 当前代码:
   if p.len() > 100 {
       format!("{}...", &p[..100])
   }

   // ✅ 修复后:
   use ralph_core::text::floor_char_boundary;

   if p.len() > 100 {
       let safe_index = floor_char_boundary(&p, 100);
       format!("{}...", &p[..safe_index])
   }
   ```

   或者更好的方案:
   ```rust
   use ralph_core::text::truncate_with_ellipsis;

   if p.chars().count() > 100 {  // 按字符数而非字节数
       truncate_with_ellipsis(&p, 100)
   }
   ```

2. 修复所有相关位置:

   - 第 1266 行: prompt_summary 截断
   - 第 2619 行: 测试代码
   - 第 2664 行: 测试代码
   - 第 2702 行: 测试代码

3. 创建统一的工具函数:

   在 crates/ralph-core/src/text.rs 中添加:
   ```rust
   /// 安全地截断字符串用于显示，保证 UTF-8 安全
   pub fn truncate_for_display(s: &str, max_bytes: usize) -> String {
       if s.len() <= max_bytes {
           return s.to_string();
       }

       let safe_bytes = floor_char_boundary(s, max_bytes);
       let truncated = &s[..safe_bytes];

       if truncated.is_empty() {
           return "...".to_string();
       }

       format!("{}...", truncated)
   }
   ```

4. 更新所有使用该模式的地方:
   ```rust
   use ralph_core::text::truncate_for_display;

   // 替换所有:
   // format!("{}...", &p[..100])
   // 为:
   truncate_for_display(&p, 100)
   ```

5. 添加测试用例:

   ```rust
   #[test]
   fn test_truncate_with_chinese_characters() {
       // 中文字符 (3字节)
       let s = "Migrate TranslateFlow 实现存在问题";
       let result = truncate_for_display(&s, 30);
       assert!(!result.contains('\\u{FFFD}')); // 无替换字符

       // 混合 ASCII 和中文
       let s = "Test 测试 Migrate 迁移";
       let result = truncate_for_display(&s, 20);
       assert!(!result.contains('\\u{FFFD}'));

       // 包含 '先' 字符 (字节 98-101)
       let s = "Migrate TranslateFlow to Mastra + React + shadcn/ui 实现存在问题";
       let result = truncate_for_display(&s, 100);
       assert!(!result.contains('\\u{FFFD}'));
   }
   ```

6. 预防措施:

   - 代码审查清单：禁止使用 `&s[..N]` 进行字符串截取
   - 添加 clippy lint 规则检测不安全的字符串切片
   - 在 CI 中添加 UTF-8 安全性测试
   - 文档化最佳实践
""")


if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("Ralph UTF-8 字符边界问题 - 完整分析和修复方案")
    print("=" * 80)

    # 运行测试
    test_utf8_truncation()

    # 分析场景
    analyze_error_scenario()

    # 生成建议
    generate_fix_recommendations()

    print("\n" + "=" * 80)
    print("下一步行动")
    print("=" * 80)
    print("""
1. 创建修复分支: git checkout -b fix/utf8-char-boundary
2. 修复 crates/ralph-cli/src/main.rs 中的 4 处问题
3. 添加测试用例
4. 运行 cargo test 验证
5. 提交 PR 并合并
6. 标记此问题为已解决
    """)
