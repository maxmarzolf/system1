export type Option = {
  code: string
  correct: boolean
}

export const cardOptions: Record<string, Option[]> = {
  // 94 – Binary Tree Inorder Traversal
  '94': [
    { code: 'result.append(node.val)', correct: true },
    { code: 'result.append(node)', correct: false },
    { code: 'result.add(node.val)', correct: false },
    { code: 'result.append(node.left.val)', correct: false },
    { code: 'result.insert(0, node.val)', correct: false },
  ],

  // 144 – Binary Tree Preorder Traversal
  '144': [
    { code: 'result.append(node.val)', correct: true },
    { code: 'result.append(node)', correct: false },
    { code: 'result.extend(node.val)', correct: false },
    { code: 'result.append(node.right.val)', correct: false },
    { code: 'result.append(str(node.val))', correct: false },
  ],

  // 145 – Binary Tree Postorder Traversal
  '145': [
    { code: 'result.append(node.val)', correct: true },
    { code: 'result.append(node)', correct: false },
    { code: 'result.insert(0, node.val)', correct: false },
    { code: 'result.append(node.val + 1)', correct: false },
    { code: 'result.append(node.left)', correct: false },
  ],

  // 589 – N-ary Tree Preorder Traversal
  '589': [
    { code: 'result.append(node.val)', correct: true },
    { code: 'result.append(node)', correct: false },
    { code: 'result.extend(node.children)', correct: false },
    { code: 'result.append(node.children[0].val)', correct: false },
    { code: 'result.add(node.val)', correct: false },
  ],

  // 590 – N-ary Tree Postorder Traversal
  '590': [
    { code: 'result.append(node.val)', correct: true },
    { code: 'result.insert(0, node.val)', correct: false },
    { code: 'result.append(node)', correct: false },
    { code: 'result.extend([node.val, node.val])', correct: false },
    { code: 'result.append(len(node.children))', correct: false },
  ],

  // 104 – Maximum Depth of Binary Tree
  '104': [
    { code: 'return 1 + max(left, right)', correct: true },
    { code: 'return max(left, right)', correct: false },
    { code: 'return 1 + min(left, right)', correct: false },
    { code: 'return 1 + left + right', correct: false },
    { code: 'return max(1 + left, right)', correct: false },
  ],

  // 111 – Minimum Depth of Binary Tree
  '111': [
    { code: 'return 1 + min_depth(node.right)', correct: true },
    { code: 'return min_depth(node.right)', correct: false },
    { code: 'return 1 + min_depth(node.left)', correct: false },
    { code: 'return 1 + max_depth(node.right)', correct: false },
    { code: 'return 2 + min_depth(node.right)', correct: false },
  ],

  // 559 – Maximum Depth of N-ary Tree
  '559': [
    { code: 'return 1 + max([0, *depths])', correct: true },
    { code: 'return max([0, *depths])', correct: false },
    { code: 'return 1 + max(depths)', correct: false },
    { code: 'return 1 + sum(depths)', correct: false },
    { code: 'return 1 + min([0, *depths])', correct: false },
  ],

  // 543 – Diameter of Binary Tree
  '543': [
    { code: 'diameter = max(diameter, left + right)', correct: true },
    { code: 'diameter = left + right', correct: false },
    { code: 'diameter = max(diameter, left * right)', correct: false },
    { code: 'diameter = max(diameter, 1 + left + right)', correct: false },
    { code: 'diameter = max(diameter, max(left, right))', correct: false },
  ],

  // 110 – Balanced Binary Tree
  '110': [
    { code: 'if abs(left - right) > 1: return -1', correct: true },
    { code: 'if abs(left - right) > 0: return -1', correct: false },
    { code: 'if left - right > 1: return -1', correct: false },
    { code: 'if abs(left + right) > 1: return -1', correct: false },
    { code: 'if abs(left - right) > 2: return -1', correct: false },
  ],

  // 563 – Binary Tree Tilt
  '563': [
    { code: 'tilt += abs(left - right)', correct: true },
    { code: 'tilt += left - right', correct: false },
    { code: 'tilt = abs(left - right)', correct: false },
    { code: 'tilt += abs(left + right)', correct: false },
    { code: 'tilt += abs(left - right) + 1', correct: false },
  ],

  // 100 – Same Tree
  '100': [
    { code: 'if not p or not q: return p is q', correct: true },
    { code: 'if not p or not q: return True', correct: false },
    { code: 'if not p and not q: return True', correct: false },
    { code: 'if not p or not q: return False', correct: false },
    { code: 'if not p or not q: return p and q', correct: false },
  ],

  // 101 – Symmetric Tree
  '101': [
    { code: 'return is_mirror(a.left, b.right) and is_mirror(a.right, b.left)', correct: true },
    { code: 'return is_mirror(a.left, b.left) and is_mirror(a.right, b.right)', correct: false },
    { code: 'return is_mirror(a.left, b.right) or is_mirror(a.right, b.left)', correct: false },
    { code: 'return is_mirror(a.right, b.right) and is_mirror(a.left, b.left)', correct: false },
    { code: 'return is_mirror(a.left, b.right)', correct: false },
  ],

  // 226 – Invert Binary Tree
  '226': [
    { code: 'node.left, node.right = right, left', correct: true },
    { code: 'node.left, node.right = left, right', correct: false },
    { code: 'node.left = right', correct: false },
    { code: 'node.right, node.left = right, left', correct: false },
    { code: 'node.left, node.right = right, right', correct: false },
  ],

  // 965 – Univalued Binary Tree
  '965': [
    { code: 'if node.val != value: return False', correct: true },
    { code: 'if node.val == value: return False', correct: false },
    { code: 'if node.val != value: return True', correct: false },
    { code: 'if node.val > value: return False', correct: false },
    { code: 'if node != value: return False', correct: false },
  ],

  // 872 – Leaf-Similar Trees
  '872': [
    { code: 'if not node.left and not node.right: leaves.append(node.val)', correct: true },
    { code: 'if not node.left or not node.right: leaves.append(node.val)', correct: false },
    { code: 'if not node.left and not node.right: leaves.append(node)', correct: false },
    { code: 'if node.left and node.right: leaves.append(node.val)', correct: false },
    { code: 'if not node.left and not node.right: leaves.insert(0, node.val)', correct: false },
  ],

  // 112 – Path Sum
  '112': [
    { code: 'return target == node.val', correct: true },
    { code: 'return target == 0', correct: false },
    { code: 'return target >= node.val', correct: false },
    { code: 'return target == node.val + 1', correct: false },
    { code: 'return target != node.val', correct: false },
  ],

  // 257 – Binary Tree Paths
  '257': [
    { code: 'paths.append(f"{path}{node.val}")', correct: true },
    { code: 'paths.append(f"{path}{node.val}->")', correct: false },
    { code: 'paths.append(f"{node.val}")', correct: false },
    { code: 'paths.append(f"{path}")', correct: false },
    { code: 'paths.append(f"{path}{node.val}->None")', correct: false },
  ],

  // 404 – Sum of Left Leaves
  '404': [
    { code: 'if node.left and not node.left.left and not node.left.right: total += node.left.val', correct: true },
    { code: 'if node.left: total += node.left.val', correct: false },
    { code: 'if node.left and not node.left.left and not node.left.right: total += node.val', correct: false },
    { code: 'if not node.left and not node.right: total += node.val', correct: false },
    { code: 'if node.left and not node.left.left or not node.left.right: total += node.left.val', correct: false },
  ],

  // 1022 – Sum of Root To Leaf Binary Numbers
  '1022': [
    { code: 'current = (current << 1) | node.val', correct: true },
    { code: 'current = (current >> 1) | node.val', correct: false },
    { code: 'current = current | node.val', correct: false },
    { code: 'current = (current << 1) | node', correct: false },
    { code: 'current = (current << 2) | node.val', correct: false },
  ],

  // 617 – Merge Two Binary Trees
  '617': [
    { code: 'merged = TreeNode(t1.val + t2.val)', correct: true },
    { code: 'merged = TreeNode(t1.val * t2.val)', correct: false },
    { code: 'merged = TreeNode(t1.val)', correct: false },
    { code: 'merged = TreeNode(t1.val - t2.val)', correct: false },
    { code: 'merged = TreeNode(max(t1.val, t2.val))', correct: false },
  ],

  // 572 – Subtree of Another Tree
  '572': [
    { code: 'return is_subtree(s.left, t) or is_subtree(s.right, t)', correct: true },
    { code: 'return is_subtree(s.left, t) and is_subtree(s.right, t)', correct: false },
    { code: 'return is_subtree(s.left, t)', correct: false },
    { code: 'return is_subtree(s, t.left) or is_subtree(s, t.right)', correct: false },
    { code: 'return is_same(s.left, t) or is_same(s.right, t)', correct: false },
  ],

  // 700 – Search in a Binary Search Tree
  '700': [
    { code: 'if val < node.val: return search(node.left, val)', correct: true },
    { code: 'if val < node.val: return search(node.right, val)', correct: false },
    { code: 'if val > node.val: return search(node.left, val)', correct: false },
    { code: 'if val < node.val: return search(node.left, node.val)', correct: false },
    { code: 'if val < node.val: search(node.left, val)', correct: false },
  ],

  // 938 – Range Sum of BST
  '938': [
    { code: 'return range_sum(node.right, low, high)', correct: true },
    { code: 'return range_sum(node.left, low, high)', correct: false },
    { code: 'return range_sum(node.right, low, high) + node.val', correct: false },
    { code: 'return 0', correct: false },
    { code: 'return range_sum(node.right, node.val, high)', correct: false },
  ],

  // 530 – Minimum Absolute Difference in BST
  '530': [
    { code: 'min_diff = min(min_diff, node.val - prev)', correct: true },
    { code: 'min_diff = node.val - prev', correct: false },
    { code: 'min_diff = min(min_diff, prev - node.val)', correct: false },
    { code: 'min_diff = min(min_diff, node.val + prev)', correct: false },
    { code: 'min_diff = min(min_diff, node.val)', correct: false },
  ],

  // 653 – Two Sum IV – Input is a BST
  '653': [
    { code: 'if k - node.val in seen: return True', correct: true },
    { code: 'if k + node.val in seen: return True', correct: false },
    { code: 'if k - node.val in seen: return False', correct: false },
    { code: 'if node.val in seen: return True', correct: false },
    { code: 'if k - node.val not in seen: return True', correct: false },
  ],

  // 682 – Baseball Game
  '682': [
    { code: 'stack.append(int(op))', correct: true },
    { code: 'stack.append(op)', correct: false },
    { code: 'stack.push(int(op))', correct: false },
    { code: 'stack.append(float(op))', correct: false },
    { code: 'stack = stack + [int(op)]', correct: false },
  ],

  // 1598 – Crawler Log Folder
  '1598': [
    { code: 'depth = max(0, depth - 1)', correct: true },
    { code: 'depth -= 1', correct: false },
    { code: 'depth = min(0, depth - 1)', correct: false },
    { code: 'depth = depth + 1', correct: false },
    { code: 'if depth: depth += 1', correct: false },
  ],

  // 1441 – Build an Array With Stack Operations
  '1441': [
    { code: "ops.append('Push')", correct: true },
    { code: "ops.append('Pop')", correct: false },
    { code: 'ops.append(value)', correct: false },
    { code: "ops.extend(['Push', 'Pop'])", correct: false },
    { code: 'current += 1', correct: false },
  ],

  // 1047 – Remove All Adjacent Duplicates In String
  '1047': [
    { code: 'if stack and stack[-1] == ch:', correct: true },
    { code: 'if stack and stack[-1] != ch:', correct: false },
    { code: 'if stack[-1] == ch:', correct: false },
    { code: 'if ch in stack:', correct: false },
    { code: 'if len(stack) > 1 and stack[-2] == ch:', correct: false },
  ],

  // 1544 – Make The String Great
  '1544': [
    { code: 'if stack and abs(ord(stack[-1]) - ord(ch)) == 32:', correct: true },
    { code: 'if stack and stack[-1].lower() == ch.lower():', correct: false },
    { code: 'if stack and stack[-1] == ch:', correct: false },
    { code: 'if abs(ord(ch)) == 32:', correct: false },
    { code: 'if stack and ord(stack[-1]) + ord(ch) == 32:', correct: false },
  ],

  // 844 – Backspace String Compare
  '844': [
    { code: "if ch == '#':", correct: true },
    { code: "if ch != '#':", correct: false },
    { code: "if ch is '#':", correct: false },
    { code: 'if ch == "\\b":', correct: false },
    { code: 'if ord(ch) == 35 and stack:', correct: false },
  ],

  // 1021 – Remove Outermost Parentheses
  '1021': [
    { code: "if bal > 0: res.append(ch)", correct: true },
    { code: 'res.append(ch)', correct: false },
    { code: "if bal >= 0: res.append(ch)", correct: false },
    { code: 'if bal > 1: res.append(ch)', correct: false },
    { code: "if ch == ')': res.append(ch)", correct: false },
  ],

  // 20 – Valid Parentheses
  '20': [
    { code: 'if ch in pairs.values():', correct: true },
    { code: 'if ch in pairs:', correct: false },
    { code: 'if ch not in pairs.values():', correct: false },
    { code: "if ch in '()[]{}':", correct: false },
    { code: "if ch == '(' or '[' or '{':", correct: false },
  ],

  // 155 – Min Stack
  '155': [
    { code: 'self.min_stack.append(min(val, self.min_stack[-1]))', correct: true },
    { code: 'self.min_stack.append(val)', correct: false },
    { code: 'self.min_stack.append(max(val, self.min_stack[-1]))', correct: false },
    { code: 'self.min_stack[-1] = min(val, self.min_stack[-1])', correct: false },
    { code: 'self.min_stack.push(min(val, self.min_stack[-1]))', correct: false },
  ],

  // 232 – Implement Queue using Stacks
  '232': [
    { code: 'while in_stack: out_stack.append(in_stack.pop())', correct: true },
    { code: 'while out_stack: in_stack.append(out_stack.pop())', correct: false },
    { code: 'out_stack.append(in_stack.pop())', correct: false },
    { code: 'while in_stack: out_stack.push(in_stack.pop())', correct: false },
    { code: 'if in_stack: out_stack = in_stack[::-1]', correct: false },
  ],

  // 225 – Implement Stack using Queues
  '225': [
    { code: 'for _ in range(len(self.q) - 1): self.q.append(self.q.popleft())', correct: true },
    { code: 'self.q.appendleft(x)', correct: false },
    { code: 'for _ in range(len(self.q)): self.q.popleft()', correct: false },
    { code: 'self.q.rotate(1)', correct: false },
    { code: 'while self.q: self.q.append(self.q.popleft())', correct: false },
  ],

  // 1475 – Final Prices With a Special Discount in a Shop
  '1475': [
    { code: 'while stack and prices[stack[-1]] >= price:', correct: true },
    { code: 'while stack and prices[stack[-1]] > price:', correct: false },
    { code: 'if stack and prices[stack[-1]] >= price:', correct: false },
    { code: 'while stack and prices[stack[-1]] <= price:', correct: false },
    { code: 'while prices[stack[-1]] >= price:', correct: false },
  ],

  // 496 – Next Greater Element I
  '496': [
    { code: 'while stack and stack[-1] < num:', correct: true },
    { code: 'while stack and stack[-1] > num:', correct: false },
    { code: 'if stack and stack[-1] < num:', correct: false },
    { code: 'while stack and stack[-1] <= num:', correct: false },
    { code: 'while num in stack:', correct: false },
  ],
}
