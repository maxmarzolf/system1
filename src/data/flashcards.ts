export type Flashcard = {
  id: string
  title: string
  difficulty: 'Easy' | 'Med.' | 'Hard' | 'Hard'
  prompt: string
  solution: string
  missing: string
  hint: string
  tags: string[]
}

export const flashcards: Flashcard[] = [
  {
    id: '94',
    title: 'Binary Tree Inorder Traversal',
    difficulty: 'Easy',
    prompt: 'Given a binary tree, return its inorder traversal values.',
    solution: `def inorder(node, result):
    if not node:
        return
    inorder(node.left, result)
    {{missing}}
    inorder(node.right, result)`,
    missing: 'result.append(node.val)',
    hint: 'Inorder is left → node → right.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '144',
    title: 'Binary Tree Preorder Traversal',
    difficulty: 'Easy',
    prompt: 'Given a binary tree, return its preorder traversal values.',
    solution: `def preorder(node, result):
    if not node:
        return
    {{missing}}
    preorder(node.left, result)
    preorder(node.right, result)`,
    missing: 'result.append(node.val)',
    hint: 'Preorder is node → left → right.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '145',
    title: 'Binary Tree Postorder Traversal',
    difficulty: 'Easy',
    prompt: 'Given a binary tree, return its postorder traversal values.',
    solution: `def postorder(node, result):
    if not node:
        return
    postorder(node.left, result)
    postorder(node.right, result)
    {{missing}}`,
    missing: 'result.append(node.val)',
    hint: 'Postorder is left → right → node.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '589',
    title: 'N-ary Tree Preorder Traversal',
    difficulty: 'Easy',
    prompt: 'Given an N-ary tree, return its preorder traversal values.',
    solution: `def preorder(node, result):
    if not node:
        return
    {{missing}}
    for child in node.children:
        preorder(child, result)`,
    missing: 'result.append(node.val)',
    hint: 'Visit the node before its children.',
    tags: ['tree', 'dfs', 'n-ary'],
  },
  {
    id: '590',
    title: 'N-ary Tree Postorder Traversal',
    difficulty: 'Easy',
    prompt: 'Given an N-ary tree, return its postorder traversal values.',
    solution: `def postorder(node, result):
    if not node:
        return
    for child in node.children:
        postorder(child, result)
    {{missing}}`,
    missing: 'result.append(node.val)',
    hint: 'Visit the node after its children.',
    tags: ['tree', 'dfs', 'n-ary'],
  },
  {
    id: '104',
    title: 'Maximum Depth of Binary Tree',
    difficulty: 'Easy',
    prompt: 'Return the maximum depth of a binary tree.',
    solution: `def max_depth(node):
    if not node:
        return 0
    left = max_depth(node.left)
    right = max_depth(node.right)
    {{missing}}`,
    missing: 'return 1 + max(left, right)',
    hint: 'Depth is 1 + max of children.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '111',
    title: 'Minimum Depth of Binary Tree',
    difficulty: 'Easy',
    prompt: 'Return the minimum depth from root to a leaf.',
    solution: `def min_depth(node):
    if not node:
        return 0
    if not node.left and not node.right:
        return 1
    if not node.left:
        {{missing}}
    if not node.right:
        return 1 + min_depth(node.left)
    return 1 + min(min_depth(node.left), min_depth(node.right))`,
    missing: 'return 1 + min_depth(node.right)',
    hint: 'If one child is missing, go through the other.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '559',
    title: 'Maximum Depth of N-ary Tree',
    difficulty: 'Easy',
    prompt: 'Return the maximum depth of an N-ary tree.',
    solution: `def max_depth(node):
    if not node:
        return 0
    depths = [max_depth(child) for child in node.children]
    {{missing}}`,
    missing: 'return 1 + max([0, *depths])',
    hint: 'Take the max of child depths.',
    tags: ['tree', 'dfs', 'n-ary'],
  },
  {
    id: '543',
    title: 'Diameter of Binary Tree',
    difficulty: 'Easy',
    prompt: 'Return the diameter (longest path) of a binary tree.',
    solution: `diameter = 0

def depth(node):
    global diameter
    if not node:
        return 0
    left = depth(node.left)
    right = depth(node.right)
    {{missing}}
    return 1 + max(left, right)`,
    missing: 'diameter = max(diameter, left + right)',
    hint: 'Update with left+right path through the node.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '110',
    title: 'Balanced Binary Tree',
    difficulty: 'Easy',
    prompt: 'Return true if the tree is height-balanced.',
    solution: `def height(node):
    if not node:
        return 0
    left = height(node.left)
    if left == -1:
        return -1
    right = height(node.right)
    if right == -1:
        return -1
    {{missing}}
    return 1 + max(left, right)`,
    missing: 'if abs(left - right) > 1: return -1',
    hint: 'Use -1 as a sentinel for imbalance.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '563',
    title: 'Binary Tree Tilt',
    difficulty: 'Easy',
    prompt: 'Return the sum of tilt values for all nodes.',
    solution: `tilt = 0

def subtree_sum(node):
    global tilt
    if not node:
        return 0
    left = subtree_sum(node.left)
    right = subtree_sum(node.right)
    {{missing}}
    return left + right + node.val`,
    missing: 'tilt += abs(left - right)',
    hint: 'Tilt is |sum(left) - sum(right)|.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '100',
    title: 'Same Tree',
    difficulty: 'Easy',
    prompt: 'Return true if two binary trees are identical.',
    solution: `def is_same(p, q):
    {{missing}}
    if p.val != q.val:
        return False
    return is_same(p.left, q.left) and is_same(p.right, q.right)`,
    missing: 'if not p or not q: return p is q',
    hint: 'Both null is true; only one null is false.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '101',
    title: 'Symmetric Tree',
    difficulty: 'Easy',
    prompt: 'Return true if the tree is a mirror of itself.',
    solution: `def is_mirror(a, b):
    if not a or not b:
        return a is b
    if a.val != b.val:
        return False
    {{missing}}`,
    missing: 'return is_mirror(a.left, b.right) and is_mirror(a.right, b.left)',
    hint: 'Compare opposite children.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '226',
    title: 'Invert Binary Tree',
    difficulty: 'Easy',
    prompt: 'Invert a binary tree (swap left and right).',
    solution: `def invert(node):
    if not node:
        return None
    left = invert(node.left)
    right = invert(node.right)
    {{missing}}
    return node`,
    missing: 'node.left, node.right = right, left',
    hint: 'Swap children after recursive calls.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '965',
    title: 'Univalued Binary Tree',
    difficulty: 'Easy',
    prompt: 'Return true if all nodes have the same value.',
    solution: `def is_unival(node, value):
    if not node:
        return True
    {{missing}}
    return is_unival(node.left, value) and is_unival(node.right, value)`,
    missing: 'if node.val != value: return False',
    hint: 'Fail fast when a value differs.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '872',
    title: 'Leaf-Similar Trees',
    difficulty: 'Easy',
    prompt: 'Return true if two trees have the same leaf sequence.',
    solution: `def collect_leaves(node, leaves):
    if not node:
        return
    {{missing}}
    collect_leaves(node.left, leaves)
    collect_leaves(node.right, leaves)`,
    missing: 'if not node.left and not node.right: leaves.append(node.val)',
    hint: 'Only push when both children are null.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '112',
    title: 'Path Sum',
    difficulty: 'Easy',
    prompt: 'Return true if a root-to-leaf path sums to target.',
    solution: `def has_path(node, target):
    if not node:
        return False
    if not node.left and not node.right:
        {{missing}}
    return has_path(node.left, target - node.val) or has_path(node.right, target - node.val)`,
    missing: 'return target == node.val',
    hint: 'At a leaf, compare remaining target.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '257',
    title: 'Binary Tree Paths',
    difficulty: 'Easy',
    prompt: 'Return all root-to-leaf paths as strings.',
    solution: `def dfs(node, path, paths):
    if not node:
        return
    if not node.left and not node.right:
        {{missing}}
        return
    next_path = f"{path}{node.val}->"
    dfs(node.left, next_path, paths)
    dfs(node.right, next_path, paths)`,
    missing: 'paths.append(f"{path}{node.val}")',
    hint: 'At leaf, finalize the path string.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '404',
    title: 'Sum of Left Leaves',
    difficulty: 'Easy',
    prompt: 'Return the sum of all left leaf values.',
    solution: `def sum_left(node):
    if not node:
        return 0
    total = 0
    {{missing}}
    return total + sum_left(node.left) + sum_left(node.right)`,
    missing: 'if node.left and not node.left.left and not node.left.right: total += node.left.val',
    hint: 'A left leaf has no children.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '1022',
    title: 'Sum of Root To Leaf Binary Numbers',
    difficulty: 'Easy',
    prompt: 'Each root-to-leaf path is a binary number; return the sum.',
    solution: `def dfs(node, current):
    if not node:
        return 0
    {{missing}}
    if not node.left and not node.right:
        return current
    return dfs(node.left, current) + dfs(node.right, current)`,
    missing: 'current = (current << 1) | node.val',
    hint: 'Shift left and add current bit.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '617',
    title: 'Merge Two Binary Trees',
    difficulty: 'Easy',
    prompt: 'Merge two trees by summing overlapping nodes.',
    solution: `def merge(t1, t2):
    if not t1:
        return t2
    if not t2:
        return t1
    {{missing}}
    merged.left = merge(t1.left, t2.left)
    merged.right = merge(t1.right, t2.right)
    return merged`,
    missing: 'merged = TreeNode(t1.val + t2.val)',
    hint: 'Create a new node with summed value.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '572',
    title: 'Subtree of Another Tree',
    difficulty: 'Easy',
    prompt: 'Return true if t is a subtree of s.',
    solution: `def is_subtree(s, t):
    if not s:
        return False
    if is_same(s, t):
        return True
    {{missing}}`,
    missing: 'return is_subtree(s.left, t) or is_subtree(s.right, t)',
    hint: 'Check both children when current node fails.',
    tags: ['tree', 'dfs'],
  },
  {
    id: '700',
    title: 'Search in a Binary Search Tree',
    difficulty: 'Easy',
    prompt: 'Return the node with a given value in a BST.',
    solution: `def search(node, val):
    if not node or node.val == val:
        return node
    {{missing}}
    return search(node.right, val)`,
    missing: 'if val < node.val: return search(node.left, val)',
    hint: 'BST property chooses direction.',
    tags: ['tree', 'bst'],
  },
  {
    id: '938',
    title: 'Range Sum of BST',
    difficulty: 'Easy',
    prompt: 'Return the sum of values in [low, high] in a BST.',
    solution: `def range_sum(node, low, high):
    if not node:
        return 0
    if node.val > high:
        return range_sum(node.left, low, high)
    if node.val < low:
        {{missing}}
    return node.val + range_sum(node.left, low, high) + range_sum(node.right, low, high)`,
    missing: 'return range_sum(node.right, low, high)',
    hint: 'Prune the side that cannot contain values.',
    tags: ['tree', 'bst'],
  },
  {
    id: '530',
    title: 'Minimum Absolute Difference in BST',
    difficulty: 'Easy',
    prompt: 'Return the minimum absolute difference between any two nodes in a BST.',
    solution: `prev = None
min_diff = float('inf')

def inorder(node):
    global prev, min_diff
    if not node:
        return
    inorder(node.left)
    if prev is not None:
        {{missing}}
    prev = node.val
    inorder(node.right)`,
    missing: 'min_diff = min(min_diff, node.val - prev)',
    hint: 'Inorder traversal yields sorted values.',
    tags: ['tree', 'bst'],
  },
  {
    id: '653',
    title: 'Two Sum IV - Input is a BST',
    difficulty: 'Easy',
    prompt: 'Return true if there exist two values summing to k.',
    solution: `seen = set()

def dfs(node, k):
    if not node:
        return False
    {{missing}}
    seen.add(node.val)
    return dfs(node.left, k) or dfs(node.right, k)`,
    missing: 'if k - node.val in seen: return True',
    hint: 'Check complement before adding current.',
    tags: ['tree', 'bst'],
  },
    {
    id: '682',
    title: 'Baseball Game',
    difficulty: 'Easy',
    prompt: 'Return the total score after processing all operations.',
    solution: `def cal_points(ops):
    stack = []
    for op in ops:
      if op.lstrip('-').isdigit():
        {{missing}}
      elif op == 'C':
        stack.pop()
      elif op == 'D':
        stack.append(2 * stack[-1])
      else:
        stack.append(stack[-1] + stack[-2])
    return sum(stack)`,
    missing: 'stack.append(int(op))',
    hint: 'Numeric operations push a new score onto the stack.',
    tags: ['stack'],
    },
    {
    id: '1598',
    title: 'Crawler Log Folder',
    difficulty: 'Easy',
    prompt: 'Return the minimum operations needed to return to the main folder.',
    solution: `def min_operations(logs):
    depth = 0
    for entry in logs:
      if entry == '../':
        {{missing}}
      elif entry != './':
        depth += 1
    return depth`,
    missing: 'depth = max(0, depth - 1)',
    hint: 'Moving up from root should still stay at depth 0.',
    tags: ['stack'],
    },
    {
    id: '1441',
    title: 'Build an Array With Stack Operations',
    difficulty: 'Med.',
    prompt: 'Return Push/Pop operations to build target from numbers 1..n.',
    solution: `def build_array(target, n):
    ops = []
    current = 1
    for value in target:
      while current < value:
        ops.append('Push')
        ops.append('Pop')
        current += 1
      {{missing}}
      current += 1
    return ops`,
    missing: "ops.append('Push')",
    hint: 'When current matches target value, keep the push.',
    tags: ['stack'],
    },
    {
    id: '1047',
    title: 'Remove All Adjacent Duplicates In String',
    difficulty: 'Easy',
    prompt: 'Repeatedly remove adjacent duplicate letters until none remain.',
    solution: `def remove_duplicates(s):
    stack = []
    for ch in s:
      {{missing}}
        stack.pop()
      else:
        stack.append(ch)
    return ''.join(stack)`,
    missing: 'if stack and stack[-1] == ch:',
    hint: 'Compare the incoming char with the top of the stack.',
    tags: ['stack'],
    },
    {
    id: '1544',
    title: 'Make The String Great',
    difficulty: 'Easy',
    prompt: 'Remove adjacent pairs where letters differ only by case.',
    solution: `def make_good(s):
    stack = []
    for ch in s:
      {{missing}}
        stack.pop()
      else:
        stack.append(ch)
    return ''.join(stack)`,
    missing: 'if stack and abs(ord(stack[-1]) - ord(ch)) == 32:',
    hint: 'Upper/lowercase versions differ by ASCII value 32.',
    tags: ['stack'],
    },
    {
    id: '844',
    title: 'Backspace String Compare',
    difficulty: 'Easy',
    prompt: 'Return true if two strings are equal after processing backspaces.',
    solution: `def build(text):
    stack = []
    for ch in text:
      {{missing}}
        if stack:
          stack.pop()
      else:
        stack.append(ch)
    return ''.join(stack)`,
    missing: "if ch == '#':",
    hint: 'Backspace removes the previous character if present.',
    tags: ['stack'],
    },
    {
    id: '1021',
    title: 'Remove Outermost Parentheses',
    difficulty: 'Easy',
    prompt: 'Remove the outermost parentheses from every primitive segment.',
    solution: `def remove_outer_parentheses(s):
    bal = 0
    res = []
    for ch in s:
      if ch == '(':
        {{missing}}
        bal += 1
      else:
        bal -= 1
        if bal > 0:
          res.append(ch)
    return ''.join(res)`,
    missing: "if bal > 0: res.append(ch)",
    hint: 'Only keep an opening parenthesis if it is not the outermost one.',
    tags: ['stack'],
    },
    {
    id: '20',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    prompt: 'Return true if brackets are validly matched and ordered.',
    solution: `def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
      {{missing}}
        stack.append(ch)
      else:
        if not stack or stack[-1] != pairs[ch]:
          return False
        stack.pop()
    return not stack`,
    missing: 'if ch in pairs.values():',
    hint: 'Push opening brackets, validate on closing brackets.',
    tags: ['stack'],
    },
    {
    id: '155',
    title: 'Min Stack',
    difficulty: 'Med.',
    prompt: 'Design a stack supporting push, pop, top, and retrieving min in O(1).',
    solution: `class MinStack:
    def __init__(self):
      self.stack = []
      self.min_stack = []

    def push(self, val):
      self.stack.append(val)
      if not self.min_stack:
        self.min_stack.append(val)
      else:
        {{missing}}`,
    missing: 'self.min_stack.append(min(val, self.min_stack[-1]))',
    hint: 'Track the running minimum in a parallel stack.',
    tags: ['stack', 'design'],
    },
    {
    id: '232',
    title: 'Implement Queue using Stacks',
    difficulty: 'Easy',
    prompt: 'Implement FIFO queue operations using two stacks.',
    solution: `def move_if_needed(in_stack, out_stack):
    if not out_stack:
      {{missing}}

  def pop(in_stack, out_stack):
    move_if_needed(in_stack, out_stack)
    return out_stack.pop()`,
    missing: 'while in_stack: out_stack.append(in_stack.pop())',
    hint: 'Transfer only when output stack is empty.',
    tags: ['stack', 'design'],
    },
    {
    id: '225',
    title: 'Implement Stack using Queues',
    difficulty: 'Easy',
    prompt: 'Implement LIFO stack operations using queues.',
    solution: `from collections import deque

  class MyStack:
    def __init__(self):
      self.q = deque()

    def push(self, x):
      self.q.append(x)
      {{missing}}`,
    missing: 'for _ in range(len(self.q) - 1): self.q.append(self.q.popleft())',
    hint: 'Rotate queue after push so newest item moves to front.',
    tags: ['stack', 'design'],
    },
    {
    id: '1475',
    title: 'Final Prices With a Special Discount in a Shop',
    difficulty: 'Easy',
    prompt: 'For each price, subtract the first following price less than or equal to it.',
    solution: `def final_prices(prices):
    result = prices[:]
    stack = []
    for idx, price in enumerate(prices):
      {{missing}}
        prev_idx = stack.pop()
        result[prev_idx] -= price
      stack.append(idx)
    return result`,
    missing: 'while stack and prices[stack[-1]] >= price:',
    hint: 'Use a monotonic increasing index stack.',
    tags: ['stack', 'monotonic-stack'],
    },
    {
    id: '496',
    title: 'Next Greater Element I',
    difficulty: 'Easy',
    prompt: 'Find the next greater element in nums2 for each value in nums1.',
    solution: `def next_greater(nums1, nums2):
    next_map = {}
    stack = []
    for num in nums2:
      {{missing}}
        next_map[stack.pop()] = num
      stack.append(num)
    for num in stack:
      next_map[num] = -1
    return [next_map[num] for num in nums1]`,
    missing: 'while stack and stack[-1] < num:',
    hint: 'Use a decreasing stack to resolve next greater values.',
    tags: ['stack', 'monotonic-stack'],
    },
]
