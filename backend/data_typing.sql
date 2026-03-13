-- Auto-generated: typing mode seed data from src/data/*.ts
-- One canonical correct answer per question (free-text typing compare).

BEGIN;

DELETE FROM question_topics WHERE question_id IN (SELECT id FROM questions WHERE mode = 'typing-race');
DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE mode = 'typing-race');
DELETE FROM questions WHERE mode = 'typing-race';

INSERT INTO topics (name, description, archived, created_at) VALUES
('array', 'Topic derived from typing mode tag: array', FALSE, CURRENT_TIMESTAMP),
('backtracking', 'Topic derived from typing mode tag: backtracking', FALSE, CURRENT_TIMESTAMP),
('bfs', 'Topic derived from typing mode tag: bfs', FALSE, CURRENT_TIMESTAMP),
('binary-search', 'Topic derived from typing mode tag: binary-search', FALSE, CURRENT_TIMESTAMP),
('binary-tree', 'Topic derived from typing mode tag: binary-tree', FALSE, CURRENT_TIMESTAMP),
('bit', 'Topic derived from typing mode tag: bit', FALSE, CURRENT_TIMESTAMP),
('bst', 'Topic derived from typing mode tag: bst', FALSE, CURRENT_TIMESTAMP),
('design', 'Topic derived from typing mode tag: design', FALSE, CURRENT_TIMESTAMP),
('dfs', 'Topic derived from typing mode tag: dfs', FALSE, CURRENT_TIMESTAMP),
('divide-conquer', 'Topic derived from typing mode tag: divide-conquer', FALSE, CURRENT_TIMESTAMP),
('dp', 'Topic derived from typing mode tag: dp', FALSE, CURRENT_TIMESTAMP),
('graph', 'Topic derived from typing mode tag: graph', FALSE, CURRENT_TIMESTAMP),
('graph-bfs', 'Topic derived from typing mode tag: graph-bfs', FALSE, CURRENT_TIMESTAMP),
('hashmap', 'Topic derived from typing mode tag: hashmap', FALSE, CURRENT_TIMESTAMP),
('heap', 'Topic derived from typing mode tag: heap', FALSE, CURRENT_TIMESTAMP),
('intervals', 'Topic derived from typing mode tag: intervals', FALSE, CURRENT_TIMESTAMP),
('kadane', 'Topic derived from typing mode tag: kadane', FALSE, CURRENT_TIMESTAMP),
('linked-list', 'Topic derived from typing mode tag: linked-list', FALSE, CURRENT_TIMESTAMP),
('math', 'Topic derived from typing mode tag: math', FALSE, CURRENT_TIMESTAMP),
('matrix', 'Topic derived from typing mode tag: matrix', FALSE, CURRENT_TIMESTAMP),
('monotonic-stack', 'Topic derived from typing mode tag: monotonic-stack', FALSE, CURRENT_TIMESTAMP),
('n-ary', 'Topic derived from typing mode tag: n-ary', FALSE, CURRENT_TIMESTAMP),
('sliding-window', 'Topic derived from typing mode tag: sliding-window', FALSE, CURRENT_TIMESTAMP),
('stack', 'Topic derived from typing mode tag: stack', FALSE, CURRENT_TIMESTAMP),
('top150', 'Topic derived from typing mode tag: top150', FALSE, CURRENT_TIMESTAMP),
('tree', 'Topic derived from typing mode tag: tree', FALSE, CURRENT_TIMESTAMP),
('trie', 'Topic derived from typing mode tag: trie', FALSE, CURRENT_TIMESTAMP),
('two-pointers', 'Topic derived from typing mode tag: two-pointers', FALSE, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;

INSERT INTO questions (question_text, difficulty, leetcode_number, mode, solution, hint_1, hint_2, hint_3, archived, created_at, updated_at) VALUES
($$Given a binary tree, return its inorder traversal values.$$, 'Easy', 94, 'typing-race', $$def inorder(node, result):
    if not node:
        return
    inorder(node.left, result)
    result.append(node.val)
    inorder(node.right, result)$$, $$Inorder is left → node → right.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a binary tree, return its preorder traversal values.$$, 'Easy', 144, 'typing-race', $$def preorder(node, result):
    if not node:
        return
    result.append(node.val)
    preorder(node.left, result)
    preorder(node.right, result)$$, $$Preorder is node → left → right.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a binary tree, return its postorder traversal values.$$, 'Easy', 145, 'typing-race', $$def postorder(node, result):
    if not node:
        return
    postorder(node.left, result)
    postorder(node.right, result)
    result.append(node.val)$$, $$Postorder is left → right → node.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an N-ary tree, return its preorder traversal values.$$, 'Easy', 589, 'typing-race', $$def preorder(node, result):
    if not node:
        return
    result.append(node.val)
    for child in node.children:
        preorder(child, result)$$, $$Visit the node before its children.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an N-ary tree, return its postorder traversal values.$$, 'Easy', 590, 'typing-race', $$def postorder(node, result):
    if not node:
        return
    for child in node.children:
        postorder(child, result)
    result.append(node.val)$$, $$Visit the node after its children.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the maximum depth of a binary tree.$$, 'Easy', 104, 'typing-race', $$def max_depth(node):
    if not node:
        return 0
    left = max_depth(node.left)
    right = max_depth(node.right)
    return 1 + max(left, right)$$, $$Depth is 1 + max of children.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the minimum depth from root to a leaf.$$, 'Easy', 111, 'typing-race', $$def min_depth(node):
    if not node:
        return 0
    if not node.left and not node.right:
        return 1
    if not node.left:
        return 1 + min_depth(node.right)
    if not node.right:
        return 1 + min_depth(node.left)
    return 1 + min(min_depth(node.left), min_depth(node.right))$$, $$If one child is missing, go through the other.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the maximum depth of an N-ary tree.$$, 'Easy', 559, 'typing-race', $$def max_depth(node):
    if not node:
        return 0
    depths = [max_depth(child) for child in node.children]
    return 1 + max([0, *depths])$$, $$Take the max of child depths.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the diameter (longest path) of a binary tree.$$, 'Easy', 543, 'typing-race', $$diameter = 0

def depth(node):
    global diameter
    if not node:
        return 0
    left = depth(node.left)
    right = depth(node.right)
    diameter = max(diameter, left + right)
    return 1 + max(left, right)$$, $$Update with left+right path through the node.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if the tree is height-balanced.$$, 'Easy', 110, 'typing-race', $$def height(node):
    if not node:
        return 0
    left = height(node.left)
    if left == -1:
        return -1
    right = height(node.right)
    if right == -1:
        return -1
    if abs(left - right) > 1: return -1
    return 1 + max(left, right)$$, $$Use -1 as a sentinel for imbalance.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the sum of tilt values for all nodes.$$, 'Easy', 563, 'typing-race', $$tilt = 0

def subtree_sum(node):
    global tilt
    if not node:
        return 0
    left = subtree_sum(node.left)
    right = subtree_sum(node.right)
    tilt += abs(left - right)
    return left + right + node.val$$, $$Tilt is |sum(left) - sum(right)|.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if two binary trees are identical.$$, 'Easy', 100, 'typing-race', $$def is_same(p, q):
    if not p or not q: return p is q
    if p.val != q.val:
        return False
    return is_same(p.left, q.left) and is_same(p.right, q.right)$$, $$Both null is true; only one null is false.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if the tree is a mirror of itself.$$, 'Easy', 101, 'typing-race', $$def is_mirror(a, b):
    if not a or not b:
        return a is b
    if a.val != b.val:
        return False
    return is_mirror(a.left, b.right) and is_mirror(a.right, b.left)$$, $$Compare opposite children.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Invert a binary tree (swap left and right).$$, 'Easy', 226, 'typing-race', $$def invert(node):
    if not node:
        return None
    left = invert(node.left)
    right = invert(node.right)
    node.left, node.right = right, left
    return node$$, $$Swap children after recursive calls.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if all nodes have the same value.$$, 'Easy', 965, 'typing-race', $$def is_unival(node, value):
    if not node:
        return True
    if node.val != value: return False
    return is_unival(node.left, value) and is_unival(node.right, value)$$, $$Fail fast when a value differs.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if two trees have the same leaf sequence.$$, 'Easy', 872, 'typing-race', $$def collect_leaves(node, leaves):
    if not node:
        return
    if not node.left and not node.right: leaves.append(node.val)
    collect_leaves(node.left, leaves)
    collect_leaves(node.right, leaves)$$, $$Only push when both children are null.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if a root-to-leaf path sums to target.$$, 'Easy', 112, 'typing-race', $$def has_path(node, target):
    if not node:
        return False
    if not node.left and not node.right:
        return target == node.val
    return has_path(node.left, target - node.val) or has_path(node.right, target - node.val)$$, $$At a leaf, compare remaining target.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return all root-to-leaf paths as strings.$$, 'Easy', 257, 'typing-race', $$def dfs(node, path, paths):
    if not node:
        return
    if not node.left and not node.right:
        paths.append(f"{path}{node.val}")
        return
    next_path = f"{path}{node.val}->"
    dfs(node.left, next_path, paths)
    dfs(node.right, next_path, paths)$$, $$At leaf, finalize the path string.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the sum of all left leaf values.$$, 'Easy', 404, 'typing-race', $$def sum_left(node):
    if not node:
        return 0
    total = 0
    if node.left and not node.left.left and not node.left.right: total += node.left.val
    return total + sum_left(node.left) + sum_left(node.right)$$, $$A left leaf has no children.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Each root-to-leaf path is a binary number; return the sum.$$, 'Easy', 1022, 'typing-race', $$def dfs(node, current):
    if not node:
        return 0
    current = (current << 1) | node.val
    if not node.left and not node.right:
        return current
    return dfs(node.left, current) + dfs(node.right, current)$$, $$Shift left and add current bit.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Merge two trees by summing overlapping nodes.$$, 'Easy', 617, 'typing-race', $$def merge(t1, t2):
    if not t1:
        return t2
    if not t2:
        return t1
    merged = TreeNode(t1.val + t2.val)
    merged.left = merge(t1.left, t2.left)
    merged.right = merge(t1.right, t2.right)
    return merged$$, $$Create a new node with summed value.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if t is a subtree of s.$$, 'Easy', 572, 'typing-race', $$def is_subtree(s, t):
    if not s:
        return False
    if is_same(s, t):
        return True
    return is_subtree(s.left, t) or is_subtree(s.right, t)$$, $$Check both children when current node fails.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the node with a given value in a BST.$$, 'Easy', 700, 'typing-race', $$def search(node, val):
    if not node or node.val == val:
        return node
    if val < node.val: return search(node.left, val)
    return search(node.right, val)$$, $$BST property chooses direction.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the sum of values in [low, high] in a BST.$$, 'Easy', 938, 'typing-race', $$def range_sum(node, low, high):
    if not node:
        return 0
    if node.val > high:
        return range_sum(node.left, low, high)
    if node.val < low:
        return range_sum(node.right, low, high)
    return node.val + range_sum(node.left, low, high) + range_sum(node.right, low, high)$$, $$Prune the side that cannot contain values.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the minimum absolute difference between any two nodes in a BST.$$, 'Easy', 530, 'typing-race', $$prev = None
min_diff = float('inf')

def inorder(node):
    global prev, min_diff
    if not node:
        return
    inorder(node.left)
    if prev is not None:
        min_diff = min(min_diff, node.val - prev)
    prev = node.val
    inorder(node.right)$$, $$Inorder traversal yields sorted values.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if there exist two values summing to k.$$, 'Easy', 653, 'typing-race', $$seen = set()

def dfs(node, k):
    if not node:
        return False
    if k - node.val in seen: return True
    seen.add(node.val)
    return dfs(node.left, k) or dfs(node.right, k)$$, $$Check complement before adding current.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the total score after processing all operations.$$, 'Easy', 682, 'typing-race', $$def cal_points(ops):
    stack = []
    for op in ops:
      if op.lstrip('-').isdigit():
        stack.append(int(op))
      elif op == 'C':
        stack.pop()
      elif op == 'D':
        stack.append(2 * stack[-1])
      else:
        stack.append(stack[-1] + stack[-2])
    return sum(stack)$$, $$Numeric operations push a new score onto the stack.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the minimum operations needed to return to the main folder.$$, 'Easy', 1598, 'typing-race', $$def min_operations(logs):
    depth = 0
    for entry in logs:
      if entry == '../':
        depth = max(0, depth - 1)
      elif entry != './':
        depth += 1
    return depth$$, $$Moving up from root should still stay at depth 0.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return Push/Pop operations to build target from numbers 1..n.$$, 'Med.', 1441, 'typing-race', $$def build_array(target, n):
    ops = []
    current = 1
    for value in target:
      while current < value:
        ops.append('Push')
        ops.append('Pop')
        current += 1
      ops.append('Push')
      current += 1
    return ops$$, $$When current matches target value, keep the push.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Repeatedly remove adjacent duplicate letters until none remain.$$, 'Easy', 1047, 'typing-race', $$def remove_duplicates(s):
    stack = []
    for ch in s:
      if stack and stack[-1] == ch:
        stack.pop()
      else:
        stack.append(ch)
    return ''.join(stack)$$, $$Compare the incoming char with the top of the stack.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Remove adjacent pairs where letters differ only by case.$$, 'Easy', 1544, 'typing-race', $$def make_good(s):
    stack = []
    for ch in s:
      if stack and abs(ord(stack[-1]) - ord(ch)) == 32:
        stack.pop()
      else:
        stack.append(ch)
    return ''.join(stack)$$, $$Upper/lowercase versions differ by ASCII value 32.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if two strings are equal after processing backspaces.$$, 'Easy', 844, 'typing-race', $$def build(text):
    stack = []
    for ch in text:
      if ch == '#':
        if stack:
          stack.pop()
      else:
        stack.append(ch)
    return ''.join(stack)$$, $$Backspace removes the previous character if present.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Remove the outermost parentheses from every primitive segment.$$, 'Easy', 1021, 'typing-race', $$def remove_outer_parentheses(s):
    bal = 0
    res = []
    for ch in s:
      if ch == '(':
        if bal > 0: res.append(ch)
        bal += 1
      else:
        bal -= 1
        if bal > 0:
          res.append(ch)
    return ''.join(res)$$, $$Only keep an opening parenthesis if it is not the outermost one.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return true if brackets are validly matched and ordered.$$, 'Easy', 20, 'typing-race', $$def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
      if ch in pairs.values():
        stack.append(ch)
      else:
        if not stack or stack[-1] != pairs[ch]:
          return False
        stack.pop()
    return not stack$$, $$Push opening brackets, validate on closing brackets.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Design a stack supporting push, pop, top, and retrieving min in O(1).$$, 'Med.', 155, 'typing-race', $$class MinStack:
    def __init__(self):
      self.stack = []
      self.min_stack = []

    def push(self, val):
      self.stack.append(val)
      if not self.min_stack:
        self.min_stack.append(val)
      else:
        self.min_stack.append(min(val, self.min_stack[-1]))$$, $$Track the running minimum in a parallel stack.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Implement FIFO queue operations using two stacks.$$, 'Easy', 232, 'typing-race', $$def move_if_needed(in_stack, out_stack):
    if not out_stack:
      while in_stack: out_stack.append(in_stack.pop())

  def pop(in_stack, out_stack):
    move_if_needed(in_stack, out_stack)
    return out_stack.pop()$$, $$Transfer only when output stack is empty.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Implement LIFO stack operations using queues.$$, 'Easy', 225, 'typing-race', $$from collections import deque

  class MyStack:
    def __init__(self):
      self.q = deque()

    def push(self, x):
      self.q.append(x)
      for _ in range(len(self.q) - 1): self.q.append(self.q.popleft())$$, $$Rotate queue after push so newest item moves to front.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$For each price, subtract the first following price less than or equal to it.$$, 'Easy', 1475, 'typing-race', $$def final_prices(prices):
    result = prices[:]
    stack = []
    for idx, price in enumerate(prices):
      while stack and prices[stack[-1]] >= price:
        prev_idx = stack.pop()
        result[prev_idx] -= price
      stack.append(idx)
    return result$$, $$Use a monotonic increasing index stack.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the next greater element in nums2 for each value in nums1.$$, 'Easy', 496, 'typing-race', $$def next_greater(nums1, nums2):
    next_map = {}
    stack = []
    for num in nums2:
      while stack and stack[-1] < num:
        next_map[stack.pop()] = num
      stack.append(num)
    for num in stack:
      next_map[num] = -1
    return [next_map[num] for num in nums1]$$, $$Use a decreasing stack to resolve next greater values.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$You are given two integer arrays nums1 and nums2, sorted in non-decreasing order, and two integers m and n representing the number of elements in nums1 and nums2. Merge nums2 into nums1 as one sorted array in-place.$$, 'Easy', 88, 'typing-race', $$def merge(nums1, m, nums2, n):
    i, j, k = m - 1, n - 1, m + n - 1
    while i >= 0 and j >= 0:
        if nums1[i] > nums2[j]:
            nums1[k] = nums1[i]
            i -= 1
        else:
            nums1[k] = nums2[j]
            j -= 1
        k -= 1
    while j >= 0:
        nums1[k] = nums2[j]
        j -= 1
        k -= 1$$, $$Fill from the end of nums1 working backward, comparing the largest remaining elements.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an integer array nums and an integer val, remove all occurrences of val in-place. Return the number of elements not equal to val.$$, 'Easy', 27, 'typing-race', $$def removeElement(nums, val):
    k = 0
    for i in range(len(nums)):
        if nums[i] != val:
            nums[k] = nums[i]
            k += 1
    return k$$, $$Use a write pointer to overwrite unwanted values.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a sorted array nums, remove the duplicates in-place such that each element appears only once. Return the new length.$$, 'Easy', 26, 'typing-race', $$def removeDuplicates(nums):
    if not nums:
        return 0
    k = 1
    for i in range(1, len(nums)):
        if nums[i] != nums[i - 1]:
            nums[k] = nums[i]
            k += 1
    return k$$, $$Compare each element with the previous; write only when different.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a sorted array nums, remove duplicates in-place such that each element appears at most twice. Return the new length.$$, 'Med.', 80, 'typing-race', $$def removeDuplicates(nums):
    k = 0
    for x in nums:
        if k < 2 or x != nums[k - 2]:
            nums[k] = x
            k += 1
    return k$$, $$Allow at most two of the same value by checking against the element two positions back.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array nums of size n, return the majority element (appears more than n/2 times). You may assume the majority element always exists.$$, 'Easy', 169, 'typing-race', $$def majorityElement(nums):
    count = 0
    candidate = None
    for num in nums:
        if count == 0:
            candidate = num
        count += 1 if num == candidate else -1
    return candidate$$, $$Boyer-Moore voting: when count drops to 0, pick a new candidate.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an integer array nums, rotate the array to the right by k steps.$$, 'Med.', 189, 'typing-race', $$def rotate(nums, k):
    def reverse(l, r):
        while l < r:
            nums[l], nums[r] = nums[r], nums[l]
            l += 1
            r -= 1
    n = len(nums)
    k %= n
    reverse(0, n - 1)
    reverse(0, k - 1)
    reverse(k, n - 1)$$, $$Reverse the whole array first, then reverse the two halves.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array prices where prices[i] is the price on the ith day, find the maximum profit from one transaction (buy then sell).$$, 'Easy', 121, 'typing-race', $$def maxProfit(prices):
    min_price = float('inf')
    max_profit = 0
    for price in prices:
        min_price = min(min_price, price)
        max_profit = max(max_profit, price - min_price)
    return max_profit$$, $$Track the minimum price seen so far and the best profit at each step.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array prices, find the maximum profit. You may buy and sell multiple times but must sell before buying again.$$, 'Med.', 122, 'typing-race', $$def maxProfit(prices):
    profit = 0
    for i in range(1, len(prices)):
        profit += max(0, prices[i] - prices[i - 1])
    return profit$$, $$Collect every upward price movement — add the gain whenever today is higher than yesterday.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an integer array nums where nums[i] is the max jump length from position i, determine if you can reach the last index.$$, 'Med.', 55, 'typing-race', $$def canJump(nums):
    farthest = 0
    for i in range(len(nums)):
        if i > farthest:
            return False
        farthest = max(farthest, i + nums[i])
    return True$$, $$Greedily track the farthest index reachable.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an integer array nums, return the minimum number of jumps to reach the last index. You can always reach the last index.$$, 'Med.', 45, 'typing-race', $$def jump(nums):
    jumps = 0
    cur_end = 0
    farthest = 0
    for i in range(len(nums) - 1):
        farthest = max(farthest, i + nums[i])
        if i == cur_end:
            jumps += 1
            cur_end = farthest
    return jumps$$, $$BFS-style: when you reach the end of the current level, jump to the farthest reachable.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array of citation counts, return the researcher's h-index (the maximum h such that h papers have at least h citations).$$, 'Med.', 274, 'typing-race', $$def hIndex(citations):
    citations.sort(reverse=True)
    h = 0
    for i, c in enumerate(citations):
        if c >= i + 1:
            h = i + 1
        else:
            break
    return h$$, $$Sort descending and find the last position where the citation count >= rank.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Implement a RandomizedSet class that supports insert, remove, and getRandom in average O(1) time.$$, 'Med.', 380, 'typing-race', $$import random

class RandomizedSet:
    def __init__(self):
        self.vals = []
        self.idx = {}

    def insert(self, val):
        if val in self.idx:
            return False
        self.idx[val] = len(self.vals)
        self.vals.append(val)
        return True

    def remove(self, val):
        if val not in self.idx:
            return False
        i = self.idx[val]
        last = self.vals[-1]
        self.vals[i] = last
        self.idx[last] = i
        self.vals.pop()
        del self.idx[val]
        return True

    def getRandom(self):
        return random.choice(self.vals)$$, $$Swap the element to remove with the last element and update the index map.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an integer array nums, return an array answer where answer[i] is the product of all elements except nums[i], without using division.$$, 'Med.', 238, 'typing-race', $$def productExceptSelf(nums):
    n = len(nums)
    answer = [1] * n
    prefix = 1
    for i in range(n):
        answer[i] = prefix
        prefix *= nums[i]
    suffix = 1
    for i in range(n - 1, -1, -1):
        answer[i] *= suffix
        suffix *= nums[i]
    return answer$$, $$Two passes: build prefix products left-to-right, then multiply by suffix products right-to-left.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$There are n gas stations in a circle. Given gas[i] and cost[i], return the starting station index for a complete circuit, or -1 if impossible.$$, 'Med.', 134, 'typing-race', $$def canCompleteCircuit(gas, cost):
    if sum(gas) < sum(cost):
        return -1
    start = 0
    tank = 0
    for i in range(len(gas)):
        tank += gas[i] - cost[i]
        if tank < 0:
            start = i + 1
            tank = 0
    return start$$, $$If tank goes negative, the answer must start after the current station.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Each child has a rating. Give each child at least 1 candy. Children with higher ratings than neighbors must get more candy. Return the minimum total.$$, 'Hard', 135, 'typing-race', $$def candy(ratings):
    n = len(ratings)
    candies = [1] * n
    for i in range(1, n):
        if ratings[i] > ratings[i - 1]:
            candies[i] = candies[i - 1] + 1
    for i in range(n - 2, -1, -1):
        if ratings[i] > ratings[i + 1]:
            candies[i] = max(candies[i], candies[i + 1] + 1)
    return sum(candies)$$, $$Two passes: left-to-right for left neighbors, right-to-left for right neighbors, taking the max.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given n non-negative integers representing an elevation map, compute how much water it can trap after raining.$$, 'Hard', 42, 'typing-race', $$def trap(height):
    l, r = 0, len(height) - 1
    l_max = r_max = 0
    water = 0
    while l < r:
        if height[l] < height[r]:
            l_max = max(l_max, height[l])
            water += l_max - height[l]
            l += 1
        else:
            r_max = max(r_max, height[r])
            water += r_max - height[r]
            r -= 1
    return water$$, $$Use two pointers. Water at each position = min(left_max, right_max) - height.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a roman numeral string, convert it to an integer.$$, 'Easy', 13, 'typing-race', $$def romanToInt(s):
    m = {'I': 1, 'V': 5, 'X': 10, 'L': 50,
         'C': 100, 'D': 500, 'M': 1000}
    result = 0
    for i in range(len(s)):
        if i + 1 < len(s) and m[s[i]] < m[s[i + 1]]:
            result -= m[s[i]]
        else:
            result += m[s[i]]
    return result$$, $$If a smaller value appears before a larger one, subtract it instead of adding.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an integer, convert it to a roman numeral string.$$, 'Med.', 12, 'typing-race', $$def intToRoman(num):
    pairs = [
        (1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'),
        (100, 'C'), (90, 'XC'), (50, 'L'), (40, 'XL'),
        (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')
    ]
    result = []
    for val, sym in pairs:
        while num >= val:
            result.append(sym)
            num -= val
    return ''.join(result)$$, $$Greedily subtract the largest possible roman value and append its symbol.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a string s consisting of words and spaces, return the length of the last word.$$, 'Easy', 58, 'typing-race', $$def lengthOfLastWord(s):
    s = s.strip()
    return len(s.split()[-1])$$, $$Strip trailing spaces, then find the last word.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Write a function to find the longest common prefix among an array of strings.$$, 'Easy', 14, 'typing-race', $$def longestCommonPrefix(strs):
    if not strs:
        return ""
    prefix = strs[0]
    for s in strs[1:]:
        while not s.startswith(prefix):
            prefix = prefix[:-1]
            if not prefix:
                return ""
    return prefix$$, $$Shrink the prefix by removing its last character until every string starts with it.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a string s, reverse the order of words. Words are separated by spaces; the result should have single spaces and no leading/trailing spaces.$$, 'Med.', 151, 'typing-race', $$def reverseWords(s):
    words = s.split()[::-1]
    return ' '.join(words)$$, $$Split on whitespace, reverse the list of words, then join with single spaces.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Write the string in a zigzag pattern on numRows rows, then read line by line.$$, 'Med.', 6, 'typing-race', $$def convert(s, numRows):
    if numRows == 1:
        return s
    rows = [''] * numRows
    cur_row = 0
    going_down = False
    for c in s:
        rows[cur_row] += c
        if cur_row == 0 or cur_row == numRows - 1:
            going_down = not going_down
        cur_row += 1 if going_down else -1
    return ''.join(rows)$$, $$Reverse direction when you hit the top or bottom row.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two strings haystack and needle, return the index of the first occurrence of needle in haystack, or -1.$$, 'Easy', 28, 'typing-race', $$def strStr(haystack, needle):
    return haystack.find(needle)$$, $$Python's str.find() returns -1 when the substring is not found.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array of words and a maxWidth, format the text so each line has exactly maxWidth characters, fully justified.$$, 'Hard', 68, 'typing-race', $$def fullJustify(words, maxWidth):
    res, line, width = [], [], 0
    for w in words:
        if width + len(w) + len(line) > maxWidth:
            for i in range(maxWidth - width):
                line[i % (len(line) - 1 or 1)] += ' '
            res.append(''.join(line))
            line, width = [], 0
        line.append(w)
        width += len(w)
    res.append(' '.join(line).ljust(maxWidth))
    return res$$, $$Distribute extra spaces round-robin between words in the current line.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a string s, return true if it is a palindrome considering only alphanumeric characters and ignoring case.$$, 'Easy', 125, 'typing-race', $$def isPalindrome(s):
    l, r = 0, len(s) - 1
    while l < r:
        while l < r and not s[l].isalnum():
            l += 1
        while l < r and not s[r].isalnum():
            r -= 1
        if s[l].lower() != s[r].lower():
            return False
        l += 1
        r -= 1
    return True$$, $$Skip non-alphanumeric characters and compare case-insensitively.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two strings s and t, return true if s is a subsequence of t.$$, 'Easy', 392, 'typing-race', $$def isSubsequence(s, t):
    i = 0
    for c in t:
        if i < len(s) and c == s[i]:
            i += 1
    return i == len(s)$$, $$Walk through t; advance the pointer in s whenever characters match.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a 1-indexed sorted array, find two numbers that add up to target. Return their 1-indexed positions.$$, 'Med.', 167, 'typing-race', $$def twoSum(numbers, target):
    l, r = 0, len(numbers) - 1
    while l < r:
        s = numbers[l] + numbers[r]
        if s == target:
            return [l + 1, r + 1]
        elif s < target:
            l += 1
        else:
            r -= 1$$, $$If the sum is too large, move the right pointer left.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given n vertical lines, find two that together with the x-axis form a container holding the most water.$$, 'Med.', 11, 'typing-race', $$def maxArea(height):
    l, r = 0, len(height) - 1
    ans = 0
    while l < r:
        ans = max(ans, min(height[l], height[r]) * (r - l))
        if height[l] < height[r]:
            l += 1
        else:
            r -= 1
    return ans$$, $$Move the pointer with the shorter line inward to potentially find a taller line.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an integer array nums, return all unique triplets [a, b, c] such that a + b + c = 0.$$, 'Med.', 15, 'typing-race', $$def threeSum(nums):
    nums.sort()
    res = []
    for i in range(len(nums) - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        l, r = i + 1, len(nums) - 1
        while l < r:
            s = nums[i] + nums[l] + nums[r]
            if s < 0:
                l += 1
            elif s > 0:
                r -= 1
            else:
                res.append([nums[i], nums[l], nums[r]])
                l += 1; r -= 1
                while l < r and nums[l] == nums[l - 1]:
                    l += 1
    return res$$, $$When a triplet is found, move both pointers and skip duplicates.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array of positive integers and a target, return the minimal length of a subarray whose sum >= target, or 0.$$, 'Med.', 209, 'typing-race', $$def minSubArrayLen(target, nums):
    l = 0
    total = 0
    ans = float('inf')
    for r in range(len(nums)):
        total += nums[r]
        while total >= target:
            ans = min(ans, r - l + 1)
            total -= nums[l]
            l += 1
    return ans if ans != float('inf') else 0$$, $$Shrink the window from the left while the sum is still >= target and track the minimum length.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a string s, find the length of the longest substring without repeating characters.$$, 'Med.', 3, 'typing-race', $$def lengthOfLongestSubstring(s):
    seen = {}
    l = 0
    ans = 0
    for r, c in enumerate(s):
        if c in seen and seen[c] >= l:
            l = seen[c] + 1
        seen[c] = r
        ans = max(ans, r - l + 1)
    return ans$$, $$Track the last index of each character; jump the left pointer past duplicates.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a string s and an array of equal-length words, find all starting indices of substrings that are a concatenation of all words in any order.$$, 'Hard', 30, 'typing-race', $$from collections import Counter

def findSubstring(s, words):
    if not s or not words:
        return []
    w_len = len(words[0])
    total = w_len * len(words)
    target = Counter(words)
    res = []
    for i in range(w_len):
        l = i
        cur = Counter()
        count = 0
        for r in range(i, len(s) - w_len + 1, w_len):
            word = s[r:r + w_len]
            if word in target:
                cur[word] += 1
                count += 1
                while cur[word] > target[word]:
                    cur[s[l:l + w_len]] -= 1
                    count -= 1
                    l += w_len
                if count == len(words):
                    res.append(l)
            else:
                cur.clear()
                count = 0
                l = r + w_len
    return res$$, $$Slide a window of word-length steps; when the word count matches, record the start index.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given strings s and t, return the minimum window substring of s that contains all characters of t.$$, 'Hard', 76, 'typing-race', $$from collections import Counter

def minWindow(s, t):
    need = Counter(t)
    missing = len(t)
    l = 0
    start, end = 0, float('inf')
    for r, c in enumerate(s):
        if need[c] > 0:
            missing -= 1
        need[c] -= 1
        while missing == 0:
            if r - l < end - start:
                start, end = l, r
            need[s[l]] += 1
            if need[s[l]] > 0: missing += 1
            l += 1
    return s[start:end + 1] if end != float('inf') else ""$$, $$Expand right until all chars are covered, then shrink left to minimize the window.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Determine if a 9x9 Sudoku board is valid. Only filled cells need to be validated.$$, 'Med.', 36, 'typing-race', $$def isValidSudoku(board):
    rows = [set() for _ in range(9)]
    cols = [set() for _ in range(9)]
    boxes = [set() for _ in range(9)]
    for i in range(9):
        for j in range(9):
            num = board[i][j]
            if num == '.':
                continue
            box = (i // 3) * 3 + j // 3
            if num in rows[i] or num in cols[j] or num in boxes[box]:
                return False
            rows[i].add(num)
            cols[j].add(num)
            boxes[box].add(num)
    return True$$, $$Map each cell to its 3x3 box index using integer division.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an m x n matrix, return all elements in spiral order.$$, 'Med.', 54, 'typing-race', $$def spiralOrder(matrix):
    res = []
    while matrix:
        res += matrix.pop(0)
        matrix = list(zip(*matrix))[::-1]
    return res$$, $$Take the first row, then rotate the remaining matrix counter-clockwise and repeat.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Rotate an n x n 2D matrix 90 degrees clockwise in-place.$$, 'Med.', 48, 'typing-race', $$def rotate(matrix):
    n = len(matrix)
    for i in range(n):
        for j in range(i + 1, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
    for row in matrix:
        row.reverse()$$, $$Transpose the matrix, then reverse each row.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$If an element is 0, set its entire row and column to 0. Do it in-place.$$, 'Med.', 73, 'typing-race', $$def setZeroes(matrix):
    m, n = len(matrix), len(matrix[0])
    first_row = any(matrix[0][j] == 0 for j in range(n))
    first_col = any(matrix[i][0] == 0 for i in range(m))
    for i in range(1, m):
        for j in range(1, n):
            if matrix[i][j] == 0:
                matrix[i][0] = 0
                matrix[0][j] = 0
    for i in range(1, m):
        for j in range(1, n):
            if matrix[i][0] == 0 or matrix[0][j] == 0:
                matrix[i][j] = 0
    if first_row:
        for j in range(n):
            matrix[0][j] = 0
    if first_col:
        for i in range(m):
            matrix[i][0] = 0$$, $$Use the first row and column as markers for which rows/columns to zero out.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Implement Conway's Game of Life. Update the board in-place simultaneously.$$, 'Med.', 289, 'typing-race', $$def gameOfLife(board):
    m, n = len(board), len(board[0])
    for i in range(m):
        for j in range(n):
            live = 0
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if di == 0 and dj == 0:
                        continue
                    ni, nj = i + di, j + dj
                    if 0 <= ni < m and 0 <= nj < n and abs(board[ni][nj]) == 1:
                        live += 1
            if board[i][j] == 1 and (live < 2 or live > 3):
                board[i][j] = -1
            if board[i][j] == 0 and live == 3:
                board[i][j] = 2
    for i in range(m):
        for j in range(n):
            board[i][j] = 1 if board[i][j] > 0 else 0$$, $$Use extra states (e.g. 2 for dead->live, -1 for live->dead) to encode transitions in-place.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two strings ransomNote and magazine, return true if ransomNote can be constructed from the letters of magazine.$$, 'Easy', 383, 'typing-race', $$from collections import Counter

def canConstruct(ransomNote, magazine):
    return not (Counter(ransomNote) - Counter(magazine))$$, $$A Counter subtraction removes letters available in the magazine; if nothing remains, it works.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two strings s and t, determine if they are isomorphic (characters can be mapped one-to-one).$$, 'Easy', 205, 'typing-race', $$def isIsomorphic(s, t):
    if len(s) != len(t):
        return False
    s_map, t_map = {}, {}
    for a, b in zip(s, t):
        if s_map.get(a, b) != b or t_map.get(b, a) != a:
            return False
        s_map[a] = b
        t_map[b] = a
    return True$$, $$Maintain two-way mappings and verify consistency at each character pair.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a pattern and a string s, determine if s follows the same pattern (bijection between letters and words).$$, 'Easy', 290, 'typing-race', $$def wordPattern(pattern, s):
    words = s.split()
    if len(pattern) != len(words):
        return False
    return len(set(zip(pattern, words))) == len(set(pattern)) == len(set(words))$$, $$The number of unique pairs must equal the number of unique pattern chars and unique words.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two strings s and t, return true if t is an anagram of s.$$, 'Easy', 242, 'typing-race', $$from collections import Counter

def isAnagram(s, t):
    return Counter(s) == Counter(t)$$, $$Two strings are anagrams if they have the same character frequency counts.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array of strings, group the anagrams together.$$, 'Med.', 49, 'typing-race', $$from collections import defaultdict

def groupAnagrams(strs):
    groups = defaultdict(list)
    for s in strs:
        groups[tuple(sorted(s))].append(s)
    return list(groups.values())$$, $$Use the sorted characters as a key to group anagrams together.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array of integers and a target, return the indices of the two numbers that add up to target.$$, 'Easy', 1, 'typing-race', $$def twoSum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i$$, $$Store each number's index in a hash map; check for the complement each step.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Determine if a number is "happy": repeatedly replace it with the sum of the squares of its digits until it equals 1 or loops forever.$$, 'Easy', 202, 'typing-race', $$def isHappy(n):
    seen = set()
    while n != 1:
        seen.add(n)
        n = sum(int(d) ** 2 for d in str(n))
        if n in seen:
            return False
    return True$$, $$Detect a cycle by tracking numbers you've already seen.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array nums and integer k, return true if there are two distinct indices i and j such that nums[i] == nums[j] and abs(i - j) <= k.$$, 'Easy', 219, 'typing-race', $$def containsNearbyDuplicate(nums, k):
    seen = {}
    for i, num in enumerate(nums):
        if num in seen and i - seen[num] <= k:
            return True
        seen[num] = i
    return False$$, $$Track the last index of each value and check if it's within k.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an unsorted array of integers, find the length of the longest consecutive elements sequence in O(n) time.$$, 'Med.', 128, 'typing-race', $$def longestConsecutive(nums):
    num_set = set(nums)
    longest = 0
    for n in num_set:
        if n - 1 not in num_set:
            length = 1
            while n + length in num_set:
                length += 1
            longest = max(longest, length)
    return longest$$, $$Only start counting from the beginning of a sequence (where n-1 is absent).$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a sorted unique integer array, return the smallest sorted list of ranges that cover all the numbers.$$, 'Easy', 228, 'typing-race', $$def summaryRanges(nums):
    res = []
    i = 0
    while i < len(nums):
        start = nums[i]
        while i + 1 < len(nums) and nums[i + 1] == nums[i] + 1:
            i += 1
        res.append(str(start) if start == nums[i] else f'{start}->{nums[i]}')
        i += 1
    return res$$, $$Extend the range while consecutive, then format as "a" or "a->b".$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array of intervals, merge all overlapping intervals.$$, 'Med.', 56, 'typing-race', $$def merge(intervals):
    intervals.sort()
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged$$, $$Sort by start time; if the current interval overlaps the last merged one, extend the end.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Insert a new interval into a sorted non-overlapping list of intervals, merging if necessary.$$, 'Med.', 57, 'typing-race', $$def insert(intervals, newInterval):
    res = []
    for i, (s, e) in enumerate(intervals):
        if e < newInterval[0]:
            res.append([s, e])
        elif s > newInterval[1]:
            res.append(newInterval)
            return res + intervals[i:]
        else:
            newInterval = [min(s, newInterval[0]), max(e, newInterval[1])]
    res.append(newInterval)
    return res$$, $$Merge overlapping intervals into newInterval by expanding its bounds.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given balloons as intervals on the x-axis, find the minimum number of arrows (vertical lines) to burst all balloons.$$, 'Med.', 452, 'typing-race', $$def findMinArrowShots(points):
    points.sort(key=lambda x: x[1])
    arrows = 1
    end = points[0][1]
    for s, e in points[1:]:
        if s > end:
            arrows += 1
            end = e
    return arrows$$, $$Sort by end point; shoot at the earliest end. Start a new arrow only when a balloon starts after the current arrow.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an absolute Unix file path, simplify it to its canonical form.$$, 'Med.', 71, 'typing-race', $$def simplifyPath(path):
    stack = []
    for part in path.split('/'):
        if part == '..':
            if stack:
                stack.pop()
        elif part and part != '.':
            stack.append(part)
    return '/' + '/'.join(stack)$$, $$Split by "/", push valid directory names, pop on "..", skip "." and empty parts.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Evaluate an arithmetic expression in Reverse Polish Notation (postfix).$$, 'Med.', 150, 'typing-race', $$def evalRPN(tokens):
    stack = []
    for t in tokens:
        if t in '+-*/':
            b, a = stack.pop(), stack.pop()
            if t == '+': stack.append(a + b)
            elif t == '-': stack.append(a - b)
            elif t == '*': stack.append(a * b)
            else: stack.append(int(a / b))
        else:
            stack.append(int(t))
    return stack[0]$$, $$Push numbers; when you see an operator, pop two operands and push the result.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Implement a basic calculator to evaluate a string expression with +, -, and parentheses.$$, 'Hard', 224, 'typing-race', $$def calculate(s):
    stack = []
    num = 0
    sign = 1
    result = 0
    for c in s:
        if c.isdigit():
            num = num * 10 + int(c)
        elif c in '+-':
            result += sign * num
            sign = 1 if c == '+' else -1
            num = 0
        elif c == '(':
            stack.append(result)
            stack.append(sign)
            result = 0
            sign = 1
            num = 0
        elif c == ')':
            result += sign * num
            result *= stack.pop()
            result = stack.pop() + result
            num = 0
    return result + sign * num$$, $$On "(" push result and sign onto the stack. On ")" apply the saved sign and add to the saved result.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given head of a linked list, determine if the list has a cycle.$$, 'Easy', 141, 'typing-race', $$def hasCycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            return True
    return False$$, $$Use Floyd's cycle detection: the fast pointer moves two steps at a time.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Two non-empty linked lists represent non-negative integers in reverse order. Return their sum as a linked list.$$, 'Med.', 2, 'typing-race', $$def addTwoNumbers(l1, l2):
    dummy = ListNode()
    cur = dummy
    carry = 0
    while l1 or l2 or carry:
        val = carry
        if l1:
            val += l1.val
            l1 = l1.next
        if l2:
            val += l2.val
            l2 = l2.next
        carry = val // 10
        cur.next = ListNode(val % 10)
        cur = cur.next
    return dummy.next$$, $$Process digits from least significant; carry forward values >= 10.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Merge two sorted linked lists into one sorted list.$$, 'Easy', 21, 'typing-race', $$def mergeTwoLists(l1, l2):
    dummy = ListNode()
    cur = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            cur.next = l1
            l1 = l1.next
        else:
            cur.next = l2
            l2 = l2.next
        cur = cur.next
    cur.next = l1 or l2
    return dummy.next$$, $$After the loop, attach whichever list still has remaining nodes.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Deep copy a linked list where each node has a next pointer and a random pointer.$$, 'Med.', 138, 'typing-race', $$def copyRandomList(head):
    if not head:
        return None
    old_to_new = {}
    cur = head
    while cur:
        old_to_new[cur] = Node(cur.val)
        cur = cur.next
    cur = head
    while cur:
        old_to_new[cur].next = old_to_new.get(cur.next)
        old_to_new[cur].random = old_to_new.get(cur.random)
        cur = cur.next
    return old_to_new[head]$$, $$First pass: create clones. Second pass: wire next and random using a hash map.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Reverse the nodes of a linked list from position left to position right.$$, 'Med.', 92, 'typing-race', $$def reverseBetween(head, left, right):
    dummy = ListNode(0, head)
    prev = dummy
    for _ in range(left - 1):
        prev = prev.next
    cur = prev.next
    for _ in range(right - left):
        temp = cur.next
        cur.next = temp.next; temp.next = prev.next
        prev.next = temp
    return dummy.next$$, $$Repeatedly move the node after cur to the front of the reversed section.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Reverse every k consecutive nodes in a linked list. If remaining nodes < k, leave them as is.$$, 'Hard', 25, 'typing-race', $$def reverseKGroup(head, k):
    dummy = ListNode(0, head)
    prev_group = dummy
    while True:
        kth = prev_group
        for _ in range(k):
            kth = kth.next
            if not kth:
                return dummy.next
        next_group = kth.next
        prev, cur = next_group, prev_group.next
        for _ in range(k):
            nxt = cur.next; cur.next = prev
            prev = cur
            cur = nxt
        prev_group.next = kth if kth else prev
        prev_group = head
        head = next_group$$, $$Reverse k nodes by flipping next pointers, then reconnect the group boundaries.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Remove the nth node from the end of a linked list and return the head.$$, 'Med.', 19, 'typing-race', $$def removeNthFromEnd(head, n):
    dummy = ListNode(0, head)
    fast = slow = dummy
    for _ in range(n + 1):
        fast = fast.next
    while fast:
        fast = fast.next
        slow = slow.next
    slow.next = slow.next.next
    return dummy.next$$, $$Move fast n+1 steps ahead, then advance both; slow ends up just before the target.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given the head of a sorted linked list, delete all nodes with duplicate numbers, leaving only distinct values.$$, 'Med.', 82, 'typing-race', $$def deleteDuplicates(head):
    dummy = ListNode(0, head)
    prev = dummy
    while head:
        if head.next and head.val == head.next.val:
            while head.next and head.val == head.next.val:
                head = head.next
            prev.next = head.next
        else:
            prev = prev.next
        head = head.next
    return dummy.next$$, $$Skip all duplicate nodes by advancing head past the duplicates, then relink prev.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a linked list, rotate the list to the right by k places.$$, 'Med.', 61, 'typing-race', $$def rotateRight(head, k):
    if not head or not head.next or k == 0:
        return head
    length = 1
    tail = head
    while tail.next:
        tail = tail.next
        length += 1
    k %= length
    if k == 0:
        return head
    tail.next = head
    cur = head
    for _ in range(length - k - 1):
        cur = cur.next
    new_head = cur.next
    cur.next = None
    return new_head$$, $$Connect tail to head to form a circle, then break it at the right point.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a linked list and a value x, partition it so all nodes < x come before nodes >= x, preserving order.$$, 'Med.', 86, 'typing-race', $$def partition(head, x):
    before = ListNode(0)
    after = ListNode(0)
    b, a = before, after
    while head:
        if head.val < x:
            b.next = head
            b = b.next
        else:
            a.next = head
            a = a.next
        head = head.next
    a.next = None
    b.next = after.next
    return before.next$$, $$Build two separate lists (before and after), then connect them.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Design a data structure for a Least Recently Used (LRU) cache with get and put in O(1).$$, 'Med.', 146, 'typing-race', $$from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        self.cache = OrderedDict()
        self.cap = capacity

    def get(self, key):
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.cap:
            self.cache.popitem(last=False)$$, $$Use an OrderedDict; move accessed keys to the end to mark them as recently used.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given preorder and inorder traversal arrays, construct the binary tree.$$, 'Med.', 105, 'typing-race', $$def buildTree(preorder, inorder):
    if not preorder:
        return None
    root = TreeNode(preorder[0])
    mid = inorder.index(preorder[0])
    root.left = buildTree(preorder[1:mid + 1], inorder[:mid])
    root.right = buildTree(preorder[mid + 1:], inorder[mid + 1:])
    return root$$, $$The first element of preorder is the root. Find it in inorder to split left and right subtrees.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given inorder and postorder traversal arrays, construct the binary tree.$$, 'Med.', 106, 'typing-race', $$def buildTree(inorder, postorder):
    if not postorder:
        return None
    root = TreeNode(postorder[-1])
    mid = inorder.index(postorder[-1])
    root.left = buildTree(inorder[:mid], postorder[:mid])
    root.right = buildTree(inorder[mid + 1:], postorder[mid:-1])
    return root$$, $$The last element of postorder is the root. Find it in inorder to partition subtrees.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Populate each node's next pointer to point to its next right node. If there is no next right node, set it to NULL.$$, 'Med.', 117, 'typing-race', $$def connect(root):
    node = root
    while node:
        dummy = ListNode(0)
        cur = dummy
        while node:
            if node.left:
                cur.next = node.left
                cur = cur.next
            if node.right:
                cur.next = node.right
                cur = cur.next
            node = node.next
        node = dummy.next
    return root$$, $$Process level by level using the next pointers already set; use a dummy node to build the next level's chain.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Flatten a binary tree to a linked list in-place using preorder traversal.$$, 'Med.', 114, 'typing-race', $$def flatten(root):
    cur = root
    while cur:
        if cur.left:
            prev = cur.left
            while prev.right:
                prev = prev.right
            prev.right = cur.right
            cur.right = cur.left
            cur.left = None
        cur = cur.right$$, $$Find the rightmost node of the left subtree and connect it to the current right subtree.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Each root-to-leaf path represents a number. Return the total sum of all root-to-leaf numbers.$$, 'Med.', 129, 'typing-race', $$def sumNumbers(root, cur=0):
    if not root:
        return 0
    cur = cur * 10 + root.val
    if not root.left and not root.right:
        return cur
    return sumNumbers(root.left, cur) + sumNumbers(root.right, cur)$$, $$Pass the running number down by multiplying by 10 and adding the current digit.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the maximum path sum in a binary tree. A path can start and end at any node.$$, 'Hard', 124, 'typing-race', $$def maxPathSum(root):
    ans = [float('-inf')]
    def dfs(node):
        if not node:
            return 0
        left = max(dfs(node.left), 0)
        right = max(dfs(node.right), 0)
        ans[0] = max(ans[0], node.val + left + right)
        return node.val + max(left, right)
    dfs(root)
    return ans[0]$$, $$At each node, consider the path going through it (left + node + right) as a candidate max, but return only one side upward.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Implement an iterator over a BST with next() and hasNext() in O(h) space.$$, 'Med.', 173, 'typing-race', $$class BSTIterator:
    def __init__(self, root):
        self.stack = []
        self._push_left(root)

    def _push_left(self, node):
        while node:
            self.stack.append(node)
            node = node.left

    def next(self):
        node = self.stack.pop()
        self._push_left(node.right)
        return node.val

    def hasNext(self):
        return len(self.stack) > 0$$, $$After popping a node, push all its right child's left descendants onto the stack.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Count the number of nodes in a complete binary tree in less than O(n) time.$$, 'Easy', 222, 'typing-race', $$def countNodes(root):
    if not root:
        return 0
    left_h = right_h = 0
    l, r = root, root
    while l:
        left_h += 1
        l = l.left
    while r:
        right_h += 1
        r = r.right
    if left_h == right_h:
        return 2 ** left_h - 1
    return 1 + countNodes(root.left) + countNodes(root.right)$$, $$If left and right heights are equal, the tree is perfect (2^h - 1 nodes). Otherwise, recurse.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a binary tree, find the lowest common ancestor (LCA) of two given nodes.$$, 'Med.', 236, 'typing-race', $$def lowestCommonAncestor(root, p, q):
    if not root or root == p or root == q:
        return root
    left = lowestCommonAncestor(root.left, p, q)
    right = lowestCommonAncestor(root.right, p, q)
    if left and right: return root
    return left or right$$, $$If both sides return a node, the current root is the LCA. Otherwise return the non-None side.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given the root of a binary tree, return the values of nodes visible from the right side.$$, 'Med.', 199, 'typing-race', $$from collections import deque

def rightSideView(root):
    if not root:
        return []
    res = []
    q = deque([root])
    while q:
        res.append(q[-1].val)
        for _ in range(len(q)):
            node = q.popleft()
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
    return res$$, $$BFS level by level; the rightmost node of each level is q[-1] before processing.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given the root of a binary tree, return the average value of nodes on each level.$$, 'Easy', 637, 'typing-race', $$from collections import deque

def averageOfLevels(root):
    res = []
    q = deque([root])
    while q:
        level_sum = 0
        size = len(q)
        for _ in range(size):
            node = q.popleft()
            level_sum += node.val
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        res.append(level_sum / size)
    return res$$, $$Sum all node values in the level and divide by the level size.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given the root of a binary tree, return the level order traversal as a list of lists.$$, 'Med.', 102, 'typing-race', $$from collections import deque

def levelOrder(root):
    if not root:
        return []
    res = []
    q = deque([root])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        res.append(level)
    return res$$, $$Process one level at a time using a queue, collecting values into a list per level.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the zigzag level order traversal of a binary tree (alternating left-to-right and right-to-left).$$, 'Med.', 103, 'typing-race', $$from collections import deque

def zigzagLevelOrder(root):
    if not root:
        return []
    res = []
    q = deque([root])
    left_to_right = True
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        res.append(level if left_to_right else level[::-1])
        left_to_right = not left_to_right
    return res$$, $$Standard BFS but reverse every other level before appending.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given the root of a BST, return the kth smallest value.$$, 'Med.', 230, 'typing-race', $$def kthSmallest(root, k):
    stack = []
    cur = root
    while cur or stack:
        while cur:
            stack.append(cur)
            cur = cur.left
        cur = stack.pop()
        k -= 1
        if k == 0:
            return cur.val
        cur = cur.right$$, $$Inorder traversal of a BST yields sorted order. Pop the kth node.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Determine if a binary tree is a valid BST.$$, 'Med.', 98, 'typing-race', $$def isValidBST(root, lo=float('-inf'), hi=float('inf')):
    if not root:
        return True
    if root.val <= lo or root.val >= hi:
        return False
    return isValidBST(root.left, lo, root.val) and isValidBST(root.right, root.val, hi)$$, $$Pass valid value bounds down the tree; each node must be strictly within (lo, hi).$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a 2D grid of "1"s (land) and "0"s (water), count the number of islands.$$, 'Med.', 200, 'typing-race', $$def numIslands(grid):
    def dfs(i, j):
        if i < 0 or i >= len(grid) or j < 0 or j >= len(grid[0]) or grid[i][j] != '1':
            return
        grid[i][j] = '0'
        dfs(i + 1, j); dfs(i - 1, j); dfs(i, j + 1); dfs(i, j - 1)
    count = 0
    for i in range(len(grid)):
        for j in range(len(grid[0])):
            if grid[i][j] == '1':
                dfs(i, j)
                count += 1
    return count$$, $$Sink visited land by marking it as water to avoid revisiting.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Capture all "O" regions that are fully surrounded by "X" by flipping them to "X".$$, 'Med.', 130, 'typing-race', $$def solve(board):
    if not board:
        return
    m, n = len(board), len(board[0])
    def dfs(i, j):
        if i < 0 or i >= m or j < 0 or j >= n or board[i][j] != 'O':
            return
        board[i][j] = 'S'
        dfs(i + 1, j); dfs(i - 1, j); dfs(i, j + 1); dfs(i, j - 1)
    for i in range(m):
        for j in range(n):
            if (i in (0, m - 1) or j in (0, n - 1)) and board[i][j] == 'O':
                dfs(i, j)
    for i in range(m):
        for j in range(n):
            if board[i][j] == 'O':
                board[i][j] = 'X'
            elif board[i][j] == 'S':
                board[i][j] = 'O'$$, $$Mark border-connected Os as safe first, then flip remaining Os to X.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a reference of a node in a connected undirected graph, return a deep copy.$$, 'Med.', 133, 'typing-race', $$def cloneGraph(node):
    if not node:
        return None
    clones = {}
    def dfs(n):
        if n in clones:
            return clones[n]
        clone = Node(n.val)
        clones[n] = clone
        clone.neighbors = [dfs(nb) for nb in n.neighbors]
        return clone
    return dfs(node)$$, $$Cache cloned nodes in a dictionary to handle cycles.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given equations a/b=k, answer queries a/c by traversing the graph of ratios.$$, 'Med.', 399, 'typing-race', $$from collections import defaultdict

def calcEquation(equations, values, queries):
    graph = defaultdict(dict)
    for (a, b), v in zip(equations, values):
        graph[a][b] = v
        graph[b][a] = 1.0 / v
    def dfs(src, dst, visited):
        if src not in graph or dst not in graph:
            return -1.0
        if src == dst:
            return 1.0
        visited.add(src)
        for nei, w in graph[src].items():
            if nei not in visited:
                res = dfs(nei, dst, visited)
                if res != -1.0:
                    return w * res
        return -1.0
    return [dfs(a, b, set()) for a, b in queries]$$, $$DFS through the ratio graph, multiplying weights along the path.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$There are numCourses courses with prerequisites. Determine if you can finish all courses (no cycles).$$, 'Med.', 207, 'typing-race', $$def canFinish(numCourses, prerequisites):
    graph = [[] for _ in range(numCourses)]
    indegree = [0] * numCourses
    for a, b in prerequisites:
        graph[b].append(a)
        indegree[a] += 1
    queue = [i for i in range(numCourses) if indegree[i] == 0]
    count = 0
    while queue:
        node = queue.pop()
        count += 1
        for nei in graph[node]:
            indegree[nei] -= 1
            if indegree[nei] == 0:
                queue.append(nei)
    return count == numCourses$$, $$Topological sort via BFS (Kahn's): enqueue nodes when their in-degree drops to 0.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the ordering of courses you should take to finish all courses, or an empty array if impossible.$$, 'Med.', 210, 'typing-race', $$def findOrder(numCourses, prerequisites):
    graph = [[] for _ in range(numCourses)]
    indegree = [0] * numCourses
    for a, b in prerequisites:
        graph[b].append(a)
        indegree[a] += 1
    queue = [i for i in range(numCourses) if indegree[i] == 0]
    order = []
    while queue:
        node = queue.pop()
        order.append(node)
        for nei in graph[node]:
            indegree[nei] -= 1
            if indegree[nei] == 0:
                queue.append(nei)
    return order if len(order) == numCourses else []$$, $$Topological sort: collect nodes in the order they reach in-degree 0.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the minimum number of dice rolls to reach the last square on a Snakes and Ladders board.$$, 'Med.', 909, 'typing-race', $$from collections import deque

def snakesAndLadders(board):
    n = len(board)
    def get_pos(s):
        r, c = divmod(s - 1, n)
        if r % 2 == 1:
            c = n - 1 - c
        return n - 1 - r, c
    visited = set()
    q = deque([(1, 0)])
    while q:
        s, moves = q.popleft()
        for i in range(1, 7):
            ns = s + i
            r, c = get_pos(ns)
            if board[r][c] != -1:
                ns = board[r][c]
            if ns == n * n:
                return moves + 1
            if ns not in visited:
                visited.add(ns)
                q.append((ns, moves + 1))
    return -1$$, $$BFS from square 1. Map square numbers to board coordinates, follow snakes/ladders.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the minimum number of mutations to go from startGene to endGene. Each mutation changes one char and must be in the bank.$$, 'Med.', 433, 'typing-race', $$from collections import deque

def minMutation(startGene, endGene, bank):
    bank_set = set(bank)
    if endGene not in bank_set:
        return -1
    q = deque([(startGene, 0)])
    visited = {startGene}
    while q:
        gene, steps = q.popleft()
        for i in range(8):
            for c in 'ACGT':
                mutation = gene[:i] + c + gene[i + 1:]
                if mutation in bank_set and mutation not in visited:
                    if mutation == endGene:
                        return steps + 1
                    visited.add(mutation)
                    q.append((mutation, steps + 1))
    return -1$$, $$BFS: at each step try all single-character mutations from ACGT at each position.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given beginWord, endWord, and a wordList, find the length of the shortest transformation sequence (each step changes one letter).$$, 'Hard', 127, 'typing-race', $$from collections import deque

def ladderLength(beginWord, endWord, wordList):
    word_set = set(wordList)
    if endWord not in word_set:
        return 0
    q = deque([(beginWord, 1)])
    visited = {beginWord}
    while q:
        word, length = q.popleft()
        for i in range(len(word)):
            for c in 'abcdefghijklmnopqrstuvwxyz':
                nw = word[:i] + c + word[i + 1:]
                if nw == endWord:
                    return length + 1
                if nw in word_set and nw not in visited:
                    visited.add(nw)
                    q.append((nw, length + 1))
    return 0$$, $$BFS: try all single-letter changes at each position from a-z.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Implement a Trie with insert, search, and startsWith methods.$$, 'Med.', 208, 'typing-race', $$class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for c in word:
            if c not in node.children:
                node.children[c] = TrieNode()
            node = node.children[c]
        node.is_end = True

    def search(self, word):
        node = self._find(word)
        return node is not None and node.is_end

    def startsWith(self, prefix):
        return self._find(prefix) is not None

    def _find(self, word):
        node = self.root
        for c in word:
            if c not in node.children:
                return None
            node = node.children[c]
        return node$$, $$After inserting all characters, mark the final node as end of word.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Design a data structure supporting addWord and search where "." matches any letter.$$, 'Med.', 211, 'typing-race', $$class WordDictionary:
    def __init__(self):
        self.children = {}
        self.is_end = False

    def addWord(self, word):
        node = self
        for c in word:
            if c not in node.children:
                node.children[c] = WordDictionary()
            node = node.children[c]
        node.is_end = True

    def search(self, word, node=None):
        node = node or self
        for i, c in enumerate(word):
            if c == '.':
                return any(self.search(word[i + 1:], child) for child in node.children.values())
            if c not in node.children:
                return False
            node = node.children[c]
        return node.is_end$$, $$On ".", recursively search all children for the remaining suffix.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a 2D board and a list of words, return all words that can be formed by sequentially adjacent cells.$$, 'Hard', 212, 'typing-race', $$def findWords(board, words):
    root = {}
    for w in words:
        node = root
        for c in w:
            node = node.setdefault(c, {})
        node['#'] = w
    m, n = len(board), len(board[0])
    res = []
    def dfs(i, j, node):
        c = board[i][j]
        if c not in node:
            return
        nxt = node[c]
        if '#' in nxt:
            res.append(nxt.pop('#'))
        board[i][j] = '.'
        for di, dj in ((0,1),(0,-1),(1,0),(-1,0)):
            ni, nj = i + di, j + dj
            if 0 <= ni < m and 0 <= nj < n:
                dfs(ni, nj, nxt)
        board[i][j] = c
    for i in range(m):
        for j in range(n):
            dfs(i, j, root)
    return res$$, $$Build a trie of words, then DFS on the board guided by the trie to prune impossible paths.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a string of digits 2-9, return all possible letter combinations (phone keypad mapping).$$, 'Med.', 17, 'typing-race', $$def letterCombinations(digits):
    if not digits:
        return []
    phone = {'2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl',
             '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz'}
    res = []
    def backtrack(i, cur):
        if i == len(digits):
            res.append(cur)
            return
        for c in phone[digits[i]]:
            backtrack(i + 1, cur + c)
    backtrack(0, '')
    return res$$, $$Backtrack through each digit's letters, building the combination character by character.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two integers n and k, return all possible combinations of k numbers from [1, n].$$, 'Med.', 77, 'typing-race', $$def combine(n, k):
    res = []
    def backtrack(start, combo):
        if len(combo) == k:
            res.append(combo[:])
            return
        for i in range(start, n + 1):
            combo.append(i)
            backtrack(i + 1, combo)
            combo.pop()
    backtrack(1, [])
    return res$$, $$Recurse with i+1 to avoid duplicates and build combinations in order.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array of distinct integers, return all possible permutations.$$, 'Med.', 46, 'typing-race', $$def permute(nums):
    res = []
    def backtrack(path, remaining):
        if not remaining:
            res.append(path)
            return
        for i in range(len(remaining)):
            backtrack(path + [remaining[i]], remaining[:i] + remaining[i + 1:])
    backtrack([], nums)
    return res$$, $$Choose each remaining element in turn, adding it to the path and recursing on the rest.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array of distinct integers and a target, return all unique combinations that sum to target. Numbers may be reused.$$, 'Med.', 39, 'typing-race', $$def combinationSum(candidates, target):
    res = []
    def backtrack(start, combo, total):
        if total == target:
            res.append(combo[:])
            return
        if total > target:
            return
        for i in range(start, len(candidates)):
            combo.append(candidates[i])
            backtrack(i, combo, total + candidates[i])
            combo.pop()
    backtrack(0, [], 0)
    return res$$, $$Pass i (not i+1) to allow reusing the same element.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the number of distinct solutions to the n-queens puzzle.$$, 'Hard', 52, 'typing-race', $$def totalNQueens(n):
    count = [0]
    cols = set()
    diag1 = set()
    diag2 = set()
    def backtrack(row):
        if row == n:
            count[0] += 1
            return
        for col in range(n):
            if col in cols or row - col in diag1 or row + col in diag2:
                continue
            cols.add(col); diag1.add(row - col); diag2.add(row + col)
            backtrack(row + 1)
            cols.remove(col); diag1.remove(row - col); diag2.remove(row + col)
    backtrack(0)
    return count[0]$$, $$Track attacked columns and both diagonals using sets.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given n pairs of parentheses, generate all valid combinations.$$, 'Med.', 22, 'typing-race', $$def generateParenthesis(n):
    res = []
    def backtrack(s, open_count, close_count):
        if len(s) == 2 * n:
            res.append(s)
            return
        if open_count < n:
            backtrack(s + '(', open_count + 1, close_count)
        if close_count < open_count:
            backtrack(s + ')', open_count, close_count + 1)
    backtrack('', 0, 0)
    return res$$, $$Only add a closing paren when the close count is less than the open count.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a 2D board and a word, determine if the word exists in the grid by moving to adjacent cells.$$, 'Med.', 79, 'typing-race', $$def exist(board, word):
    m, n = len(board), len(board[0])
    def dfs(i, j, k):
        if k == len(word):
            return True
        if i < 0 or i >= m or j < 0 or j >= n or board[i][j] != word[k]:
            return False
        tmp = board[i][j]
        board[i][j] = '#'
        found = dfs(i+1,j,k+1) or dfs(i-1,j,k+1) or dfs(i,j+1,k+1) or dfs(i,j-1,k+1)
        board[i][j] = tmp
        return found
    for i in range(m):
        for j in range(n):
            if dfs(i, j, 0):
                return True
    return False$$, $$Mark visited cells, explore all 4 directions, then restore the cell.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a sorted array, convert it to a height-balanced BST.$$, 'Easy', 108, 'typing-race', $$def sortedArrayToBST(nums):
    if not nums:
        return None
    mid = len(nums) // 2
    root = TreeNode(nums[mid])
    root.left = sortedArrayToBST(nums[:mid])
    root.right = sortedArrayToBST(nums[mid + 1:])
    return root$$, $$Pick the middle element as root to keep the tree balanced.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Sort a linked list in O(n log n) time and O(1) space.$$, 'Med.', 148, 'typing-race', $$def sortList(head):
    if not head or not head.next:
        return head
    slow, fast = head, head.next
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    mid = slow.next
    slow.next = None
    left = sortList(head)
    right = sortList(mid)
    return merge(left, right)$$, $$Split at the midpoint, recursively sort both halves, then merge.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an n x n grid of 0s and 1s, construct a Quad-Tree representation.$$, 'Med.', 427, 'typing-race', $$def construct(grid):
    def build(r, c, size):
        if size == 1:
            return Node(grid[r][c] == 1, True)
        half = size // 2
        tl = build(r, c, half)
        tr = build(r, c + half, half)
        bl = build(r + half, c, half)
        br = build(r + half, c + half, half)
        if tl.isLeaf and tr.isLeaf and bl.isLeaf and br.isLeaf and tl.val == tr.val == bl.val == br.val:
            return Node(tl.val, True)
        return Node(False, False, tl, tr, bl, br)
    return build(0, 0, len(grid))$$, $$If all four children are leaves with the same value, merge them into one leaf.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Merge k sorted linked lists into one sorted linked list.$$, 'Hard', 23, 'typing-race', $$import heapq

def mergeKLists(lists):
    heap = []
    for i, l in enumerate(lists):
        if l:
            heapq.heappush(heap, (l.val, i, l))
    dummy = ListNode()
    cur = dummy
    while heap:
        val, i, node = heapq.heappop(heap)
        cur.next = node
        cur = cur.next
        if node.next:
            heapq.heappush(heap, (node.next.val, i, node.next))
    return dummy.next$$, $$Use a min-heap to always pick the smallest head among all lists.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the contiguous subarray with the largest sum.$$, 'Med.', 53, 'typing-race', $$def maxSubArray(nums):
    max_sum = cur_sum = nums[0]
    for num in nums[1:]:
        cur_sum = max(num, cur_sum + num)
        max_sum = max(max_sum, cur_sum)
    return max_sum$$, $$At each step decide: start fresh or extend the current subarray.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a circular integer array, find the maximum possible subarray sum.$$, 'Med.', 918, 'typing-race', $$def maxSubarraySumCircular(nums):
    total = 0
    max_sum = cur_max = nums[0]
    min_sum = cur_min = nums[0]
    for num in nums[1:]:
        cur_max = max(num, cur_max + num)
        max_sum = max(max_sum, cur_max)
        cur_min = min(num, cur_min + num)
        min_sum = min(min_sum, cur_min)
        total += num
    total += nums[0]
    return max(max_sum, total - min_sum) if max_sum > 0 else max_sum$$, $$The max circular sum is either a normal Kadane max or total minus the minimum subarray, unless all values are negative.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a sorted array and a target, return the index where it would be inserted.$$, 'Easy', 35, 'typing-race', $$def searchInsert(nums, target):
    l, r = 0, len(nums) - 1
    while l <= r:
        mid = (l + r) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            l = mid + 1
        else:
            r = mid - 1
    return l$$, $$Standard binary search; when not found, l is the correct insertion point.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Search for a target in a sorted m x n matrix where each row follows the previous row's last element.$$, 'Med.', 74, 'typing-race', $$def searchMatrix(matrix, target):
    m, n = len(matrix), len(matrix[0])
    l, r = 0, m * n - 1
    while l <= r:
        mid = (l + r) // 2
        val = matrix[mid // n][mid % n]
        if val == target:
            return True
        elif val < target:
            l = mid + 1
        else:
            r = mid - 1
    return False$$, $$Treat the matrix as a flat sorted array using divmod to get row and column.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find a peak element in an array (strictly greater than neighbors) and return its index.$$, 'Med.', 162, 'typing-race', $$def findPeakElement(nums):
    l, r = 0, len(nums) - 1
    while l < r:
        mid = (l + r) // 2
        if nums[mid] > nums[mid + 1]:
            r = mid
        else:
            l = mid + 1
    return l$$, $$Binary search: move toward the side with the larger neighbor.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Search for a target in a rotated sorted array. Return its index or -1.$$, 'Med.', 33, 'typing-race', $$def search(nums, target):
    l, r = 0, len(nums) - 1
    while l <= r:
        mid = (l + r) // 2
        if nums[mid] == target:
            return mid
        if nums[l] <= nums[mid]:
            if nums[l] <= target < nums[mid]:
                r = mid - 1
            else:
                l = mid + 1
        else:
            if nums[mid] < target <= nums[r]:
                l = mid + 1
            else:
                r = mid - 1
    return -1$$, $$Determine which half is sorted and check if the target lies in that range.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the starting and ending position of a given target in a sorted array.$$, 'Med.', 34, 'typing-race', $$def searchRange(nums, target):
    def bisect(left_bias):
        l, r = 0, len(nums) - 1
        idx = -1
        while l <= r:
            mid = (l + r) // 2
            if nums[mid] == target:
                idx = mid
                if left_bias: r = mid - 1
                else: l = mid + 1
            elif nums[mid] < target:
                l = mid + 1
            else:
                r = mid - 1
        return idx
    return [bisect(True), bisect(False)]$$, $$Run binary search twice: once biased left (to find first) and once biased right (to find last).$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the minimum element in a rotated sorted array (no duplicates).$$, 'Med.', 153, 'typing-race', $$def findMin(nums):
    l, r = 0, len(nums) - 1
    while l < r:
        mid = (l + r) // 2
        if nums[mid] > nums[r]:
            l = mid + 1
        else:
            r = mid
    return nums[l]$$, $$If mid > right, the minimum is in the right half.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two sorted arrays, return the median of the combined array in O(log(m+n)).$$, 'Hard', 4, 'typing-race', $$def findMedianSortedArrays(nums1, nums2):
    if len(nums1) > len(nums2):
        nums1, nums2 = nums2, nums1
    m, n = len(nums1), len(nums2)
    l, r = 0, m
    while l <= r:
        i = (l + r) // 2
        j = (m + n + 1) // 2 - i
        left1 = nums1[i - 1] if i > 0 else float('-inf')
        right1 = nums1[i] if i < m else float('inf')
        left2 = nums2[j - 1] if j > 0 else float('-inf')
        right2 = nums2[j] if j < n else float('inf')
        if left1 <= right2 and left2 <= right1:
            if (m + n) % 2 == 0: return (max(left1, left2) + min(right1, right2)) / 2
            else: return max(left1, left2)
        elif left1 > right2:
            r = i - 1
        else:
            l = i + 1$$, $$Binary search on the smaller array to find a partition where all left elements <= all right elements.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the kth largest element in an unsorted array.$$, 'Med.', 215, 'typing-race', $$import heapq

def findKthLargest(nums, k):
    heap = []
    for num in nums:
        heapq.heappush(heap, num)
        if len(heap) > k:
            heapq.heappop(heap)
    return heap[0]$$, $$Maintain a min-heap of size k; the top is the kth largest.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Maximize capital after completing at most k projects. Each project has a profit and minimum capital requirement.$$, 'Hard', 502, 'typing-race', $$import heapq

def findMaximizedCapital(k, w, profits, capital):
    projects = sorted(zip(capital, profits))
    heap = []
    i = 0
    for _ in range(k):
        while i < len(projects) and projects[i][0] <= w:
            heapq.heappush(heap, -projects[i][1])
            i += 1
        if not heap:
            break
        w += -heapq.heappop(heap)
    return w$$, $$Greedily pick the most profitable affordable project using a max-heap (negate values).$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two sorted arrays, find k pairs (u, v) with the smallest sums.$$, 'Med.', 373, 'typing-race', $$import heapq

def kSmallestPairs(nums1, nums2, k):
    if not nums1 or not nums2:
        return []
    heap = [(nums1[i] + nums2[0], i, 0) for i in range(min(k, len(nums1)))]
    heapq.heapify(heap)
    res = []
    while heap and len(res) < k:
        s, i, j = heapq.heappop(heap)
        res.append([nums1[i], nums2[j]])
        if j + 1 < len(nums2):
            heapq.heappush(heap, (nums1[i] + nums2[j + 1], i, j + 1))
    return res$$, $$Start with (nums1[i], nums2[0]) pairs in a heap; for each popped pair advance the nums2 index.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Design a data structure that supports addNum and findMedian for a stream of integers.$$, 'Hard', 295, 'typing-race', $$import heapq

class MedianFinder:
    def __init__(self):
        self.lo = []  # max-heap (negated)
        self.hi = []  # min-heap

    def addNum(self, num):
        heapq.heappush(self.lo, -num)
        heapq.heappush(self.hi, -heapq.heappop(self.lo))
        if self.hi and -self.lo[0] > self.hi[0]: heapq.heappush(self.lo, -heapq.heappop(self.hi))
        if len(self.lo) > len(self.hi) + 1:
            heapq.heappush(self.hi, -heapq.heappop(self.lo))

    def findMedian(self):
        if len(self.lo) > len(self.hi):
            return -self.lo[0]
        return (-self.lo[0] + self.hi[0]) / 2$$, $$Use two heaps: a max-heap for the lower half and a min-heap for the upper half, keeping them balanced.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two binary strings, return their sum as a binary string.$$, 'Easy', 67, 'typing-race', $$def addBinary(a, b):
    result = []
    carry = 0
    i, j = len(a) - 1, len(b) - 1
    while i >= 0 or j >= 0 or carry:
        total = carry
        if i >= 0:
            total += int(a[i]); i -= 1
        if j >= 0:
            total += int(b[j]); j -= 1
        result.append(str(total % 2))
        carry = total // 2
    return ''.join(reversed(result))$$, $$Process from right to left, appending bit % 2 and carrying bit // 2.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Reverse the bits of a given 32-bit unsigned integer.$$, 'Easy', 190, 'typing-race', $$def reverseBits(n):
    result = 0
    for _ in range(32):
        result = (result << 1) | (n & 1)
        n >>= 1
    return result$$, $$Shift result left and OR with the lowest bit of n each iteration.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Return the number of 1 bits in the binary representation of an unsigned integer.$$, 'Easy', 191, 'typing-race', $$def hammingWeight(n):
    count = 0
    while n:
        n &= n - 1
        count += 1
    return count$$, $$n & (n-1) clears the lowest set bit each iteration.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Every element appears twice except one. Find the single element.$$, 'Easy', 136, 'typing-race', $$def singleNumber(nums):
    result = 0
    for num in nums:
        result ^= num
    return result$$, $$XOR of a number with itself is 0; XOR all elements to isolate the unique one.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Every element appears three times except one. Find the single element.$$, 'Med.', 137, 'typing-race', $$def singleNumber(nums):
    ones = twos = 0
    for num in nums:
        ones = (ones ^ num) & ~twos
        twos = (twos ^ num) & ~ones
    return ones$$, $$Use two bitmasks to count each bit modulo 3.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a range [left, right], return the bitwise AND of all numbers in the range.$$, 'Med.', 201, 'typing-race', $$def rangeBitwiseAnd(left, right):
    shift = 0
    while left != right:
        left >>= 1
        right >>= 1
        shift += 1
    return left << shift$$, $$Right-shift both numbers until they are equal; the common prefix is the AND result.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Determine whether an integer is a palindrome without converting to string.$$, 'Easy', 9, 'typing-race', $$def isPalindrome(x):
    if x < 0 or (x % 10 == 0 and x != 0):
        return False
    rev = 0
    while x > rev:
        rev = rev * 10 + x % 10
        x //= 10
    return x == rev or x == rev // 10$$, $$Reverse the second half of the number and compare it to the first half.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a large integer as an array of digits, add one to it.$$, 'Easy', 66, 'typing-race', $$def plusOne(digits):
    for i in range(len(digits) - 1, -1, -1):
        if digits[i] < 9:
            digits[i] += 1
            return digits
        digits[i] = 0
    return [1] + digits$$, $$Walk from the last digit; if it's < 9 just increment and return, otherwise set to 0 and carry.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an integer n, return the number of trailing zeroes in n!.$$, 'Med.', 172, 'typing-race', $$def trailingZeroes(n):
    count = 0
    while n >= 5:
        n //= 5
        count += n
    return count$$, $$Count factors of 5: n/5 + n/25 + n/125 + ...$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Compute the integer square root of x (truncated).$$, 'Easy', 69, 'typing-race', $$def mySqrt(x):
    l, r = 0, x
    while l <= r:
        mid = (l + r) // 2
        if mid * mid <= x:
            ans = mid
            l = mid + 1
        else:
            r = mid - 1
    return ans$$, $$Binary search for the largest mid where mid*mid <= x.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Implement pow(x, n) computing x raised to the power n.$$, 'Med.', 50, 'typing-race', $$def myPow(x, n):
    if n < 0:
        x, n = 1 / x, -n
    result = 1
    while n:
        if n % 2 == 1:
            result *= x
        x *= x
        n //= 2
    return result$$, $$Exponentiation by squaring: square x and halve n each step.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given n points on a 2D plane, find the maximum number of points on the same straight line.$$, 'Hard', 149, 'typing-race', $$from collections import defaultdict
from math import gcd

def maxPoints(points):
    n = len(points)
    if n <= 2:
        return n
    ans = 2
    for i in range(n):
        slopes = defaultdict(int)
        for j in range(i + 1, n):
            dx = points[j][0] - points[i][0]
            dy = points[j][1] - points[i][1]
            g = gcd(dx, dy)
            if g != 0: dx, dy = dx // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1), dy // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1)
            slopes[(dx // g, dy // g)] += 1
        ans = max(ans, max(slopes.values()) + 1)
    return ans$$, $$Normalize slope by GCD and sign to group collinear points. Count max points sharing a slope from each anchor.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$You can climb 1 or 2 steps. How many distinct ways can you climb to the top (n steps)?$$, 'Easy', 70, 'typing-race', $$def climbStairs(n):
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b$$, $$This is the Fibonacci sequence: ways(n) = ways(n-1) + ways(n-2).$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an array of house values, find the maximum money you can rob without robbing two adjacent houses.$$, 'Med.', 198, 'typing-race', $$def rob(nums):
    prev1 = prev2 = 0
    for num in nums:
        temp = max(prev1, prev2 + num)
        prev2 = prev1
        prev1 = temp
    return prev1$$, $$At each house choose: skip it (prev1) or rob it (prev2 + num).$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a string s and a dictionary wordDict, return true if s can be segmented into dictionary words.$$, 'Med.', 139, 'typing-race', $$def wordBreak(s, wordDict):
    word_set = set(wordDict)
    dp = [False] * (len(s) + 1)
    dp[0] = True
    for i in range(1, len(s) + 1):
        for j in range(i):
            if dp[j] and s[j:i] in word_set:
                dp[i] = True
                break
    return dp[len(s)]$$, $$dp[i] is True if there exists j < i such that dp[j] is True and s[j:i] is a word.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given coin denominations and an amount, return the fewest coins needed to make the amount, or -1.$$, 'Med.', 322, 'typing-race', $$def coinChange(coins, amount):
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for i in range(1, amount + 1):
        for c in coins:
            if c <= i:
                dp[i] = min(dp[i], dp[i - c] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1$$, $$For each amount, try every coin and take the minimum count.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an integer array, return the length of the longest strictly increasing subsequence.$$, 'Med.', 300, 'typing-race', $$import bisect

def lengthOfLIS(nums):
    tails = []
    for num in nums:
        pos = bisect.bisect_left(tails, num)
        if pos == len(tails):
            tails.append(num)
        else:
            tails[pos] = num
    return len(tails)$$, $$Maintain a tails array; binary search for where each number fits to keep it as small as possible.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a triangle array, find the minimum path sum from top to bottom (moving to adjacent numbers on the row below).$$, 'Med.', 120, 'typing-race', $$def minimumTotal(triangle):
    dp = triangle[-1][:]
    for i in range(len(triangle) - 2, -1, -1):
        for j in range(len(triangle[i])):
            dp[j] = triangle[i][j] + min(dp[j], dp[j + 1])
    return dp[0]$$, $$Bottom-up DP: at each cell pick the smaller of the two children below.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given an m x n grid of non-negative numbers, find a path from top-left to bottom-right that minimizes the sum.$$, 'Med.', 64, 'typing-race', $$def minPathSum(grid):
    m, n = len(grid), len(grid[0])
    for i in range(m):
        for j in range(n):
            if i == 0 and j == 0:
                continue
            elif i == 0:
                grid[i][j] += grid[i][j - 1]
            elif j == 0:
                grid[i][j] += grid[i - 1][j]
            else:
                grid[i][j] += min(grid[i - 1][j], grid[i][j - 1])
    return grid[m - 1][n - 1]$$, $$Each cell's cost = its value + min of the cell above and cell to the left.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$A robot on an m x n grid with obstacles can move right or down. How many unique paths exist from top-left to bottom-right?$$, 'Med.', 63, 'typing-race', $$def uniquePathsWithObstacles(grid):
    m, n = len(grid), len(grid[0])
    dp = [0] * n
    dp[0] = 1
    for i in range(m):
        for j in range(n):
            if grid[i][j] == 1:
                dp[j] = 0
            elif j > 0:
                dp[j] += dp[j - 1]
    return dp[n - 1]$$, $$Paths to cell (i,j) = paths from above (already in dp[j]) + paths from the left (dp[j-1]).$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given a string s, return the longest palindromic substring.$$, 'Med.', 5, 'typing-race', $$def longestPalindrome(s):
    res = ""
    def expand(l, r):
        nonlocal res
        while l >= 0 and r < len(s) and s[l] == s[r]:
            if r - l + 1 > len(res):
                res = s[l:r + 1]
            l -= 1
            r += 1
    for i in range(len(s)):
        expand(i, i)
        expand(i, i + 1)
    return res$$, $$Expand around each center (odd and even lengths) and track the longest palindrome found.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given strings s1, s2, and s3, determine if s3 is formed by interleaving s1 and s2.$$, 'Med.', 97, 'typing-race', $$def isInterleave(s1, s2, s3):
    if len(s1) + len(s2) != len(s3):
        return False
    dp = [False] * (len(s2) + 1)
    for i in range(len(s1) + 1):
        for j in range(len(s2) + 1):
            if i == 0 and j == 0:
                dp[j] = True
            elif i == 0:
                dp[j] = dp[j - 1] and s2[j - 1] == s3[j - 1]
            elif j == 0:
                dp[j] = dp[j] and s1[i - 1] == s3[i - 1]
            else:
                dp[j] = (dp[j] and s1[i - 1] == s3[i + j - 1]) or (dp[j - 1] and s2[j - 1] == s3[i + j - 1])
    return dp[len(s2)]$$, $$dp[j] is True if we can form s3[:i+j] from s1[:i] and s2[:j], checking the last char from either string.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Given two strings word1 and word2, return the minimum edit distance (insert, delete, replace).$$, 'Med.', 72, 'typing-race', $$def minDistance(word1, word2):
    m, n = len(word1), len(word2)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            if word1[i - 1] == word2[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
    return dp[n]$$, $$If chars differ, take 1 + min of replace (diagonal), delete (above), or insert (left).$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the maximum profit with at most two transactions.$$, 'Hard', 123, 'typing-race', $$def maxProfit(prices):
    buy1 = buy2 = float('inf')
    profit1 = profit2 = 0
    for p in prices:
        buy1 = min(buy1, p)
        profit1 = max(profit1, p - buy1)
        buy2 = min(buy2, p - profit1)
        profit2 = max(profit2, p - buy2)
    return profit2$$, $$Track two transactions: buy2 uses the profit from the first sale as a discount.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the maximum profit with at most k transactions.$$, 'Hard', 188, 'typing-race', $$def maxProfit(k, prices):
    if not prices:
        return 0
    n = len(prices)
    if k >= n // 2:
        return sum(max(0, prices[i] - prices[i - 1]) for i in range(1, n))
    dp = [[0] * n for _ in range(k + 1)]
    for t in range(1, k + 1):
        max_diff = -prices[0]
        for d in range(1, n):
            dp[t][d] = max(dp[t][d - 1], prices[d] + max_diff)
            max_diff = max(max_diff, dp[t - 1][d] - prices[d])
    return dp[k][n - 1]$$, $$Optimize the inner loop by tracking max(dp[t-1][j] - prices[j]) as you go.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
($$Find the largest square containing only 1s in a binary matrix and return its area.$$, 'Med.', 221, 'typing-race', $$def maximalSquare(matrix):
    if not matrix:
        return 0
    m, n = len(matrix), len(matrix[0])
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    max_side = 0
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if matrix[i - 1][j - 1] == '1':
                dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1
                max_side = max(max_side, dp[i][j])
    return max_side * max_side$$, $$The side of the largest square at (i,j) = 1 + min of top, left, and top-left neighbors.$$, NULL, NULL, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Exactly one correct canonical answer per typing question
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 94 AND q.question_text = $$Given a binary tree, return its inorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), $$def inorder(node, result):
    if not node:
        return
    inorder(node.left, result)
    result.append(node.val)
    inorder(node.right, result)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 144 AND q.question_text = $$Given a binary tree, return its preorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), $$def preorder(node, result):
    if not node:
        return
    result.append(node.val)
    preorder(node.left, result)
    preorder(node.right, result)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 145 AND q.question_text = $$Given a binary tree, return its postorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), $$def postorder(node, result):
    if not node:
        return
    postorder(node.left, result)
    postorder(node.right, result)
    result.append(node.val)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 589 AND q.question_text = $$Given an N-ary tree, return its preorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), $$def preorder(node, result):
    if not node:
        return
    result.append(node.val)
    for child in node.children:
        preorder(child, result)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 590 AND q.question_text = $$Given an N-ary tree, return its postorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), $$def postorder(node, result):
    if not node:
        return
    for child in node.children:
        postorder(child, result)
    result.append(node.val)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 104 AND q.question_text = $$Return the maximum depth of a binary tree.$$ ORDER BY q.id DESC LIMIT 1), $$def max_depth(node):
    if not node:
        return 0
    left = max_depth(node.left)
    right = max_depth(node.right)
    return 1 + max(left, right)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 111 AND q.question_text = $$Return the minimum depth from root to a leaf.$$ ORDER BY q.id DESC LIMIT 1), $$def min_depth(node):
    if not node:
        return 0
    if not node.left and not node.right:
        return 1
    if not node.left:
        return 1 + min_depth(node.right)
    if not node.right:
        return 1 + min_depth(node.left)
    return 1 + min(min_depth(node.left), min_depth(node.right))$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 559 AND q.question_text = $$Return the maximum depth of an N-ary tree.$$ ORDER BY q.id DESC LIMIT 1), $$def max_depth(node):
    if not node:
        return 0
    depths = [max_depth(child) for child in node.children]
    return 1 + max([0, *depths])$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 543 AND q.question_text = $$Return the diameter (longest path) of a binary tree.$$ ORDER BY q.id DESC LIMIT 1), $$diameter = 0

def depth(node):
    global diameter
    if not node:
        return 0
    left = depth(node.left)
    right = depth(node.right)
    diameter = max(diameter, left + right)
    return 1 + max(left, right)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 110 AND q.question_text = $$Return true if the tree is height-balanced.$$ ORDER BY q.id DESC LIMIT 1), $$def height(node):
    if not node:
        return 0
    left = height(node.left)
    if left == -1:
        return -1
    right = height(node.right)
    if right == -1:
        return -1
    if abs(left - right) > 1: return -1
    return 1 + max(left, right)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 563 AND q.question_text = $$Return the sum of tilt values for all nodes.$$ ORDER BY q.id DESC LIMIT 1), $$tilt = 0

def subtree_sum(node):
    global tilt
    if not node:
        return 0
    left = subtree_sum(node.left)
    right = subtree_sum(node.right)
    tilt += abs(left - right)
    return left + right + node.val$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 100 AND q.question_text = $$Return true if two binary trees are identical.$$ ORDER BY q.id DESC LIMIT 1), $$def is_same(p, q):
    if not p or not q: return p is q
    if p.val != q.val:
        return False
    return is_same(p.left, q.left) and is_same(p.right, q.right)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 101 AND q.question_text = $$Return true if the tree is a mirror of itself.$$ ORDER BY q.id DESC LIMIT 1), $$def is_mirror(a, b):
    if not a or not b:
        return a is b
    if a.val != b.val:
        return False
    return is_mirror(a.left, b.right) and is_mirror(a.right, b.left)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 226 AND q.question_text = $$Invert a binary tree (swap left and right).$$ ORDER BY q.id DESC LIMIT 1), $$def invert(node):
    if not node:
        return None
    left = invert(node.left)
    right = invert(node.right)
    node.left, node.right = right, left
    return node$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 965 AND q.question_text = $$Return true if all nodes have the same value.$$ ORDER BY q.id DESC LIMIT 1), $$def is_unival(node, value):
    if not node:
        return True
    if node.val != value: return False
    return is_unival(node.left, value) and is_unival(node.right, value)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 872 AND q.question_text = $$Return true if two trees have the same leaf sequence.$$ ORDER BY q.id DESC LIMIT 1), $$def collect_leaves(node, leaves):
    if not node:
        return
    if not node.left and not node.right: leaves.append(node.val)
    collect_leaves(node.left, leaves)
    collect_leaves(node.right, leaves)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 112 AND q.question_text = $$Return true if a root-to-leaf path sums to target.$$ ORDER BY q.id DESC LIMIT 1), $$def has_path(node, target):
    if not node:
        return False
    if not node.left and not node.right:
        return target == node.val
    return has_path(node.left, target - node.val) or has_path(node.right, target - node.val)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 257 AND q.question_text = $$Return all root-to-leaf paths as strings.$$ ORDER BY q.id DESC LIMIT 1), $$def dfs(node, path, paths):
    if not node:
        return
    if not node.left and not node.right:
        paths.append(f"{path}{node.val}")
        return
    next_path = f"{path}{node.val}->"
    dfs(node.left, next_path, paths)
    dfs(node.right, next_path, paths)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 404 AND q.question_text = $$Return the sum of all left leaf values.$$ ORDER BY q.id DESC LIMIT 1), $$def sum_left(node):
    if not node:
        return 0
    total = 0
    if node.left and not node.left.left and not node.left.right: total += node.left.val
    return total + sum_left(node.left) + sum_left(node.right)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1022 AND q.question_text = $$Each root-to-leaf path is a binary number; return the sum.$$ ORDER BY q.id DESC LIMIT 1), $$def dfs(node, current):
    if not node:
        return 0
    current = (current << 1) | node.val
    if not node.left and not node.right:
        return current
    return dfs(node.left, current) + dfs(node.right, current)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 617 AND q.question_text = $$Merge two trees by summing overlapping nodes.$$ ORDER BY q.id DESC LIMIT 1), $$def merge(t1, t2):
    if not t1:
        return t2
    if not t2:
        return t1
    merged = TreeNode(t1.val + t2.val)
    merged.left = merge(t1.left, t2.left)
    merged.right = merge(t1.right, t2.right)
    return merged$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 572 AND q.question_text = $$Return true if t is a subtree of s.$$ ORDER BY q.id DESC LIMIT 1), $$def is_subtree(s, t):
    if not s:
        return False
    if is_same(s, t):
        return True
    return is_subtree(s.left, t) or is_subtree(s.right, t)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 700 AND q.question_text = $$Return the node with a given value in a BST.$$ ORDER BY q.id DESC LIMIT 1), $$def search(node, val):
    if not node or node.val == val:
        return node
    if val < node.val: return search(node.left, val)
    return search(node.right, val)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 938 AND q.question_text = $$Return the sum of values in [low, high] in a BST.$$ ORDER BY q.id DESC LIMIT 1), $$def range_sum(node, low, high):
    if not node:
        return 0
    if node.val > high:
        return range_sum(node.left, low, high)
    if node.val < low:
        return range_sum(node.right, low, high)
    return node.val + range_sum(node.left, low, high) + range_sum(node.right, low, high)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 530 AND q.question_text = $$Return the minimum absolute difference between any two nodes in a BST.$$ ORDER BY q.id DESC LIMIT 1), $$prev = None
min_diff = float('inf')

def inorder(node):
    global prev, min_diff
    if not node:
        return
    inorder(node.left)
    if prev is not None:
        min_diff = min(min_diff, node.val - prev)
    prev = node.val
    inorder(node.right)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 653 AND q.question_text = $$Return true if there exist two values summing to k.$$ ORDER BY q.id DESC LIMIT 1), $$seen = set()

def dfs(node, k):
    if not node:
        return False
    if k - node.val in seen: return True
    seen.add(node.val)
    return dfs(node.left, k) or dfs(node.right, k)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 682 AND q.question_text = $$Return the total score after processing all operations.$$ ORDER BY q.id DESC LIMIT 1), $$def cal_points(ops):
    stack = []
    for op in ops:
      if op.lstrip('-').isdigit():
        stack.append(int(op))
      elif op == 'C':
        stack.pop()
      elif op == 'D':
        stack.append(2 * stack[-1])
      else:
        stack.append(stack[-1] + stack[-2])
    return sum(stack)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1598 AND q.question_text = $$Return the minimum operations needed to return to the main folder.$$ ORDER BY q.id DESC LIMIT 1), $$def min_operations(logs):
    depth = 0
    for entry in logs:
      if entry == '../':
        depth = max(0, depth - 1)
      elif entry != './':
        depth += 1
    return depth$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1441 AND q.question_text = $$Return Push/Pop operations to build target from numbers 1..n.$$ ORDER BY q.id DESC LIMIT 1), $$def build_array(target, n):
    ops = []
    current = 1
    for value in target:
      while current < value:
        ops.append('Push')
        ops.append('Pop')
        current += 1
      ops.append('Push')
      current += 1
    return ops$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1047 AND q.question_text = $$Repeatedly remove adjacent duplicate letters until none remain.$$ ORDER BY q.id DESC LIMIT 1), $$def remove_duplicates(s):
    stack = []
    for ch in s:
      if stack and stack[-1] == ch:
        stack.pop()
      else:
        stack.append(ch)
    return ''.join(stack)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1544 AND q.question_text = $$Remove adjacent pairs where letters differ only by case.$$ ORDER BY q.id DESC LIMIT 1), $$def make_good(s):
    stack = []
    for ch in s:
      if stack and abs(ord(stack[-1]) - ord(ch)) == 32:
        stack.pop()
      else:
        stack.append(ch)
    return ''.join(stack)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 844 AND q.question_text = $$Return true if two strings are equal after processing backspaces.$$ ORDER BY q.id DESC LIMIT 1), $$def build(text):
    stack = []
    for ch in text:
      if ch == '#':
        if stack:
          stack.pop()
      else:
        stack.append(ch)
    return ''.join(stack)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1021 AND q.question_text = $$Remove the outermost parentheses from every primitive segment.$$ ORDER BY q.id DESC LIMIT 1), $$def remove_outer_parentheses(s):
    bal = 0
    res = []
    for ch in s:
      if ch == '(':
        if bal > 0: res.append(ch)
        bal += 1
      else:
        bal -= 1
        if bal > 0:
          res.append(ch)
    return ''.join(res)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 20 AND q.question_text = $$Return true if brackets are validly matched and ordered.$$ ORDER BY q.id DESC LIMIT 1), $$def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
      if ch in pairs.values():
        stack.append(ch)
      else:
        if not stack or stack[-1] != pairs[ch]:
          return False
        stack.pop()
    return not stack$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 155 AND q.question_text = $$Design a stack supporting push, pop, top, and retrieving min in O(1).$$ ORDER BY q.id DESC LIMIT 1), $$class MinStack:
    def __init__(self):
      self.stack = []
      self.min_stack = []

    def push(self, val):
      self.stack.append(val)
      if not self.min_stack:
        self.min_stack.append(val)
      else:
        self.min_stack.append(min(val, self.min_stack[-1]))$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 232 AND q.question_text = $$Implement FIFO queue operations using two stacks.$$ ORDER BY q.id DESC LIMIT 1), $$def move_if_needed(in_stack, out_stack):
    if not out_stack:
      while in_stack: out_stack.append(in_stack.pop())

  def pop(in_stack, out_stack):
    move_if_needed(in_stack, out_stack)
    return out_stack.pop()$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 225 AND q.question_text = $$Implement LIFO stack operations using queues.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import deque

  class MyStack:
    def __init__(self):
      self.q = deque()

    def push(self, x):
      self.q.append(x)
      for _ in range(len(self.q) - 1): self.q.append(self.q.popleft())$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1475 AND q.question_text = $$For each price, subtract the first following price less than or equal to it.$$ ORDER BY q.id DESC LIMIT 1), $$def final_prices(prices):
    result = prices[:]
    stack = []
    for idx, price in enumerate(prices):
      while stack and prices[stack[-1]] >= price:
        prev_idx = stack.pop()
        result[prev_idx] -= price
      stack.append(idx)
    return result$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 496 AND q.question_text = $$Find the next greater element in nums2 for each value in nums1.$$ ORDER BY q.id DESC LIMIT 1), $$def next_greater(nums1, nums2):
    next_map = {}
    stack = []
    for num in nums2:
      while stack and stack[-1] < num:
        next_map[stack.pop()] = num
      stack.append(num)
    for num in stack:
      next_map[num] = -1
    return [next_map[num] for num in nums1]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 88 AND q.question_text = $$You are given two integer arrays nums1 and nums2, sorted in non-decreasing order, and two integers m and n representing the number of elements in nums1 and nums2. Merge nums2 into nums1 as one sorted array in-place.$$ ORDER BY q.id DESC LIMIT 1), $$def merge(nums1, m, nums2, n):
    i, j, k = m - 1, n - 1, m + n - 1
    while i >= 0 and j >= 0:
        if nums1[i] > nums2[j]:
            nums1[k] = nums1[i]
            i -= 1
        else:
            nums1[k] = nums2[j]
            j -= 1
        k -= 1
    while j >= 0:
        nums1[k] = nums2[j]
        j -= 1
        k -= 1$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 27 AND q.question_text = $$Given an integer array nums and an integer val, remove all occurrences of val in-place. Return the number of elements not equal to val.$$ ORDER BY q.id DESC LIMIT 1), $$def removeElement(nums, val):
    k = 0
    for i in range(len(nums)):
        if nums[i] != val:
            nums[k] = nums[i]
            k += 1
    return k$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 26 AND q.question_text = $$Given a sorted array nums, remove the duplicates in-place such that each element appears only once. Return the new length.$$ ORDER BY q.id DESC LIMIT 1), $$def removeDuplicates(nums):
    if not nums:
        return 0
    k = 1
    for i in range(1, len(nums)):
        if nums[i] != nums[i - 1]:
            nums[k] = nums[i]
            k += 1
    return k$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 80 AND q.question_text = $$Given a sorted array nums, remove duplicates in-place such that each element appears at most twice. Return the new length.$$ ORDER BY q.id DESC LIMIT 1), $$def removeDuplicates(nums):
    k = 0
    for x in nums:
        if k < 2 or x != nums[k - 2]:
            nums[k] = x
            k += 1
    return k$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 169 AND q.question_text = $$Given an array nums of size n, return the majority element (appears more than n/2 times). You may assume the majority element always exists.$$ ORDER BY q.id DESC LIMIT 1), $$def majorityElement(nums):
    count = 0
    candidate = None
    for num in nums:
        if count == 0:
            candidate = num
        count += 1 if num == candidate else -1
    return candidate$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 189 AND q.question_text = $$Given an integer array nums, rotate the array to the right by k steps.$$ ORDER BY q.id DESC LIMIT 1), $$def rotate(nums, k):
    def reverse(l, r):
        while l < r:
            nums[l], nums[r] = nums[r], nums[l]
            l += 1
            r -= 1
    n = len(nums)
    k %= n
    reverse(0, n - 1)
    reverse(0, k - 1)
    reverse(k, n - 1)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 121 AND q.question_text = $$Given an array prices where prices[i] is the price on the ith day, find the maximum profit from one transaction (buy then sell).$$ ORDER BY q.id DESC LIMIT 1), $$def maxProfit(prices):
    min_price = float('inf')
    max_profit = 0
    for price in prices:
        min_price = min(min_price, price)
        max_profit = max(max_profit, price - min_price)
    return max_profit$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 122 AND q.question_text = $$Given an array prices, find the maximum profit. You may buy and sell multiple times but must sell before buying again.$$ ORDER BY q.id DESC LIMIT 1), $$def maxProfit(prices):
    profit = 0
    for i in range(1, len(prices)):
        profit += max(0, prices[i] - prices[i - 1])
    return profit$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 55 AND q.question_text = $$Given an integer array nums where nums[i] is the max jump length from position i, determine if you can reach the last index.$$ ORDER BY q.id DESC LIMIT 1), $$def canJump(nums):
    farthest = 0
    for i in range(len(nums)):
        if i > farthest:
            return False
        farthest = max(farthest, i + nums[i])
    return True$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 45 AND q.question_text = $$Given an integer array nums, return the minimum number of jumps to reach the last index. You can always reach the last index.$$ ORDER BY q.id DESC LIMIT 1), $$def jump(nums):
    jumps = 0
    cur_end = 0
    farthest = 0
    for i in range(len(nums) - 1):
        farthest = max(farthest, i + nums[i])
        if i == cur_end:
            jumps += 1
            cur_end = farthest
    return jumps$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 274 AND q.question_text = $$Given an array of citation counts, return the researcher's h-index (the maximum h such that h papers have at least h citations).$$ ORDER BY q.id DESC LIMIT 1), $$def hIndex(citations):
    citations.sort(reverse=True)
    h = 0
    for i, c in enumerate(citations):
        if c >= i + 1:
            h = i + 1
        else:
            break
    return h$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 380 AND q.question_text = $$Implement a RandomizedSet class that supports insert, remove, and getRandom in average O(1) time.$$ ORDER BY q.id DESC LIMIT 1), $$import random

class RandomizedSet:
    def __init__(self):
        self.vals = []
        self.idx = {}

    def insert(self, val):
        if val in self.idx:
            return False
        self.idx[val] = len(self.vals)
        self.vals.append(val)
        return True

    def remove(self, val):
        if val not in self.idx:
            return False
        i = self.idx[val]
        last = self.vals[-1]
        self.vals[i] = last
        self.idx[last] = i
        self.vals.pop()
        del self.idx[val]
        return True

    def getRandom(self):
        return random.choice(self.vals)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 238 AND q.question_text = $$Given an integer array nums, return an array answer where answer[i] is the product of all elements except nums[i], without using division.$$ ORDER BY q.id DESC LIMIT 1), $$def productExceptSelf(nums):
    n = len(nums)
    answer = [1] * n
    prefix = 1
    for i in range(n):
        answer[i] = prefix
        prefix *= nums[i]
    suffix = 1
    for i in range(n - 1, -1, -1):
        answer[i] *= suffix
        suffix *= nums[i]
    return answer$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 134 AND q.question_text = $$There are n gas stations in a circle. Given gas[i] and cost[i], return the starting station index for a complete circuit, or -1 if impossible.$$ ORDER BY q.id DESC LIMIT 1), $$def canCompleteCircuit(gas, cost):
    if sum(gas) < sum(cost):
        return -1
    start = 0
    tank = 0
    for i in range(len(gas)):
        tank += gas[i] - cost[i]
        if tank < 0:
            start = i + 1
            tank = 0
    return start$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 135 AND q.question_text = $$Each child has a rating. Give each child at least 1 candy. Children with higher ratings than neighbors must get more candy. Return the minimum total.$$ ORDER BY q.id DESC LIMIT 1), $$def candy(ratings):
    n = len(ratings)
    candies = [1] * n
    for i in range(1, n):
        if ratings[i] > ratings[i - 1]:
            candies[i] = candies[i - 1] + 1
    for i in range(n - 2, -1, -1):
        if ratings[i] > ratings[i + 1]:
            candies[i] = max(candies[i], candies[i + 1] + 1)
    return sum(candies)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 42 AND q.question_text = $$Given n non-negative integers representing an elevation map, compute how much water it can trap after raining.$$ ORDER BY q.id DESC LIMIT 1), $$def trap(height):
    l, r = 0, len(height) - 1
    l_max = r_max = 0
    water = 0
    while l < r:
        if height[l] < height[r]:
            l_max = max(l_max, height[l])
            water += l_max - height[l]
            l += 1
        else:
            r_max = max(r_max, height[r])
            water += r_max - height[r]
            r -= 1
    return water$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 13 AND q.question_text = $$Given a roman numeral string, convert it to an integer.$$ ORDER BY q.id DESC LIMIT 1), $$def romanToInt(s):
    m = {'I': 1, 'V': 5, 'X': 10, 'L': 50,
         'C': 100, 'D': 500, 'M': 1000}
    result = 0
    for i in range(len(s)):
        if i + 1 < len(s) and m[s[i]] < m[s[i + 1]]:
            result -= m[s[i]]
        else:
            result += m[s[i]]
    return result$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 12 AND q.question_text = $$Given an integer, convert it to a roman numeral string.$$ ORDER BY q.id DESC LIMIT 1), $$def intToRoman(num):
    pairs = [
        (1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'),
        (100, 'C'), (90, 'XC'), (50, 'L'), (40, 'XL'),
        (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')
    ]
    result = []
    for val, sym in pairs:
        while num >= val:
            result.append(sym)
            num -= val
    return ''.join(result)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 58 AND q.question_text = $$Given a string s consisting of words and spaces, return the length of the last word.$$ ORDER BY q.id DESC LIMIT 1), $$def lengthOfLastWord(s):
    s = s.strip()
    return len(s.split()[-1])$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 14 AND q.question_text = $$Write a function to find the longest common prefix among an array of strings.$$ ORDER BY q.id DESC LIMIT 1), $$def longestCommonPrefix(strs):
    if not strs:
        return ""
    prefix = strs[0]
    for s in strs[1:]:
        while not s.startswith(prefix):
            prefix = prefix[:-1]
            if not prefix:
                return ""
    return prefix$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 151 AND q.question_text = $$Given a string s, reverse the order of words. Words are separated by spaces; the result should have single spaces and no leading/trailing spaces.$$ ORDER BY q.id DESC LIMIT 1), $$def reverseWords(s):
    words = s.split()[::-1]
    return ' '.join(words)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 6 AND q.question_text = $$Write the string in a zigzag pattern on numRows rows, then read line by line.$$ ORDER BY q.id DESC LIMIT 1), $$def convert(s, numRows):
    if numRows == 1:
        return s
    rows = [''] * numRows
    cur_row = 0
    going_down = False
    for c in s:
        rows[cur_row] += c
        if cur_row == 0 or cur_row == numRows - 1:
            going_down = not going_down
        cur_row += 1 if going_down else -1
    return ''.join(rows)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 28 AND q.question_text = $$Given two strings haystack and needle, return the index of the first occurrence of needle in haystack, or -1.$$ ORDER BY q.id DESC LIMIT 1), $$def strStr(haystack, needle):
    return haystack.find(needle)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 68 AND q.question_text = $$Given an array of words and a maxWidth, format the text so each line has exactly maxWidth characters, fully justified.$$ ORDER BY q.id DESC LIMIT 1), $$def fullJustify(words, maxWidth):
    res, line, width = [], [], 0
    for w in words:
        if width + len(w) + len(line) > maxWidth:
            for i in range(maxWidth - width):
                line[i % (len(line) - 1 or 1)] += ' '
            res.append(''.join(line))
            line, width = [], 0
        line.append(w)
        width += len(w)
    res.append(' '.join(line).ljust(maxWidth))
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 125 AND q.question_text = $$Given a string s, return true if it is a palindrome considering only alphanumeric characters and ignoring case.$$ ORDER BY q.id DESC LIMIT 1), $$def isPalindrome(s):
    l, r = 0, len(s) - 1
    while l < r:
        while l < r and not s[l].isalnum():
            l += 1
        while l < r and not s[r].isalnum():
            r -= 1
        if s[l].lower() != s[r].lower():
            return False
        l += 1
        r -= 1
    return True$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 392 AND q.question_text = $$Given two strings s and t, return true if s is a subsequence of t.$$ ORDER BY q.id DESC LIMIT 1), $$def isSubsequence(s, t):
    i = 0
    for c in t:
        if i < len(s) and c == s[i]:
            i += 1
    return i == len(s)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 167 AND q.question_text = $$Given a 1-indexed sorted array, find two numbers that add up to target. Return their 1-indexed positions.$$ ORDER BY q.id DESC LIMIT 1), $$def twoSum(numbers, target):
    l, r = 0, len(numbers) - 1
    while l < r:
        s = numbers[l] + numbers[r]
        if s == target:
            return [l + 1, r + 1]
        elif s < target:
            l += 1
        else:
            r -= 1$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 11 AND q.question_text = $$Given n vertical lines, find two that together with the x-axis form a container holding the most water.$$ ORDER BY q.id DESC LIMIT 1), $$def maxArea(height):
    l, r = 0, len(height) - 1
    ans = 0
    while l < r:
        ans = max(ans, min(height[l], height[r]) * (r - l))
        if height[l] < height[r]:
            l += 1
        else:
            r -= 1
    return ans$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 15 AND q.question_text = $$Given an integer array nums, return all unique triplets [a, b, c] such that a + b + c = 0.$$ ORDER BY q.id DESC LIMIT 1), $$def threeSum(nums):
    nums.sort()
    res = []
    for i in range(len(nums) - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        l, r = i + 1, len(nums) - 1
        while l < r:
            s = nums[i] + nums[l] + nums[r]
            if s < 0:
                l += 1
            elif s > 0:
                r -= 1
            else:
                res.append([nums[i], nums[l], nums[r]])
                l += 1; r -= 1
                while l < r and nums[l] == nums[l - 1]:
                    l += 1
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 209 AND q.question_text = $$Given an array of positive integers and a target, return the minimal length of a subarray whose sum >= target, or 0.$$ ORDER BY q.id DESC LIMIT 1), $$def minSubArrayLen(target, nums):
    l = 0
    total = 0
    ans = float('inf')
    for r in range(len(nums)):
        total += nums[r]
        while total >= target:
            ans = min(ans, r - l + 1)
            total -= nums[l]
            l += 1
    return ans if ans != float('inf') else 0$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 3 AND q.question_text = $$Given a string s, find the length of the longest substring without repeating characters.$$ ORDER BY q.id DESC LIMIT 1), $$def lengthOfLongestSubstring(s):
    seen = {}
    l = 0
    ans = 0
    for r, c in enumerate(s):
        if c in seen and seen[c] >= l:
            l = seen[c] + 1
        seen[c] = r
        ans = max(ans, r - l + 1)
    return ans$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 30 AND q.question_text = $$Given a string s and an array of equal-length words, find all starting indices of substrings that are a concatenation of all words in any order.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import Counter

def findSubstring(s, words):
    if not s or not words:
        return []
    w_len = len(words[0])
    total = w_len * len(words)
    target = Counter(words)
    res = []
    for i in range(w_len):
        l = i
        cur = Counter()
        count = 0
        for r in range(i, len(s) - w_len + 1, w_len):
            word = s[r:r + w_len]
            if word in target:
                cur[word] += 1
                count += 1
                while cur[word] > target[word]:
                    cur[s[l:l + w_len]] -= 1
                    count -= 1
                    l += w_len
                if count == len(words):
                    res.append(l)
            else:
                cur.clear()
                count = 0
                l = r + w_len
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 76 AND q.question_text = $$Given strings s and t, return the minimum window substring of s that contains all characters of t.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import Counter

def minWindow(s, t):
    need = Counter(t)
    missing = len(t)
    l = 0
    start, end = 0, float('inf')
    for r, c in enumerate(s):
        if need[c] > 0:
            missing -= 1
        need[c] -= 1
        while missing == 0:
            if r - l < end - start:
                start, end = l, r
            need[s[l]] += 1
            if need[s[l]] > 0: missing += 1
            l += 1
    return s[start:end + 1] if end != float('inf') else ""$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 36 AND q.question_text = $$Determine if a 9x9 Sudoku board is valid. Only filled cells need to be validated.$$ ORDER BY q.id DESC LIMIT 1), $$def isValidSudoku(board):
    rows = [set() for _ in range(9)]
    cols = [set() for _ in range(9)]
    boxes = [set() for _ in range(9)]
    for i in range(9):
        for j in range(9):
            num = board[i][j]
            if num == '.':
                continue
            box = (i // 3) * 3 + j // 3
            if num in rows[i] or num in cols[j] or num in boxes[box]:
                return False
            rows[i].add(num)
            cols[j].add(num)
            boxes[box].add(num)
    return True$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 54 AND q.question_text = $$Given an m x n matrix, return all elements in spiral order.$$ ORDER BY q.id DESC LIMIT 1), $$def spiralOrder(matrix):
    res = []
    while matrix:
        res += matrix.pop(0)
        matrix = list(zip(*matrix))[::-1]
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 48 AND q.question_text = $$Rotate an n x n 2D matrix 90 degrees clockwise in-place.$$ ORDER BY q.id DESC LIMIT 1), $$def rotate(matrix):
    n = len(matrix)
    for i in range(n):
        for j in range(i + 1, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
    for row in matrix:
        row.reverse()$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 73 AND q.question_text = $$If an element is 0, set its entire row and column to 0. Do it in-place.$$ ORDER BY q.id DESC LIMIT 1), $$def setZeroes(matrix):
    m, n = len(matrix), len(matrix[0])
    first_row = any(matrix[0][j] == 0 for j in range(n))
    first_col = any(matrix[i][0] == 0 for i in range(m))
    for i in range(1, m):
        for j in range(1, n):
            if matrix[i][j] == 0:
                matrix[i][0] = 0
                matrix[0][j] = 0
    for i in range(1, m):
        for j in range(1, n):
            if matrix[i][0] == 0 or matrix[0][j] == 0:
                matrix[i][j] = 0
    if first_row:
        for j in range(n):
            matrix[0][j] = 0
    if first_col:
        for i in range(m):
            matrix[i][0] = 0$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 289 AND q.question_text = $$Implement Conway's Game of Life. Update the board in-place simultaneously.$$ ORDER BY q.id DESC LIMIT 1), $$def gameOfLife(board):
    m, n = len(board), len(board[0])
    for i in range(m):
        for j in range(n):
            live = 0
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if di == 0 and dj == 0:
                        continue
                    ni, nj = i + di, j + dj
                    if 0 <= ni < m and 0 <= nj < n and abs(board[ni][nj]) == 1:
                        live += 1
            if board[i][j] == 1 and (live < 2 or live > 3):
                board[i][j] = -1
            if board[i][j] == 0 and live == 3:
                board[i][j] = 2
    for i in range(m):
        for j in range(n):
            board[i][j] = 1 if board[i][j] > 0 else 0$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 383 AND q.question_text = $$Given two strings ransomNote and magazine, return true if ransomNote can be constructed from the letters of magazine.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import Counter

def canConstruct(ransomNote, magazine):
    return not (Counter(ransomNote) - Counter(magazine))$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 205 AND q.question_text = $$Given two strings s and t, determine if they are isomorphic (characters can be mapped one-to-one).$$ ORDER BY q.id DESC LIMIT 1), $$def isIsomorphic(s, t):
    if len(s) != len(t):
        return False
    s_map, t_map = {}, {}
    for a, b in zip(s, t):
        if s_map.get(a, b) != b or t_map.get(b, a) != a:
            return False
        s_map[a] = b
        t_map[b] = a
    return True$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 290 AND q.question_text = $$Given a pattern and a string s, determine if s follows the same pattern (bijection between letters and words).$$ ORDER BY q.id DESC LIMIT 1), $$def wordPattern(pattern, s):
    words = s.split()
    if len(pattern) != len(words):
        return False
    return len(set(zip(pattern, words))) == len(set(pattern)) == len(set(words))$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 242 AND q.question_text = $$Given two strings s and t, return true if t is an anagram of s.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import Counter

def isAnagram(s, t):
    return Counter(s) == Counter(t)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 49 AND q.question_text = $$Given an array of strings, group the anagrams together.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import defaultdict

def groupAnagrams(strs):
    groups = defaultdict(list)
    for s in strs:
        groups[tuple(sorted(s))].append(s)
    return list(groups.values())$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1 AND q.question_text = $$Given an array of integers and a target, return the indices of the two numbers that add up to target.$$ ORDER BY q.id DESC LIMIT 1), $$def twoSum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 202 AND q.question_text = $$Determine if a number is "happy": repeatedly replace it with the sum of the squares of its digits until it equals 1 or loops forever.$$ ORDER BY q.id DESC LIMIT 1), $$def isHappy(n):
    seen = set()
    while n != 1:
        seen.add(n)
        n = sum(int(d) ** 2 for d in str(n))
        if n in seen:
            return False
    return True$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 219 AND q.question_text = $$Given an array nums and integer k, return true if there are two distinct indices i and j such that nums[i] == nums[j] and abs(i - j) <= k.$$ ORDER BY q.id DESC LIMIT 1), $$def containsNearbyDuplicate(nums, k):
    seen = {}
    for i, num in enumerate(nums):
        if num in seen and i - seen[num] <= k:
            return True
        seen[num] = i
    return False$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 128 AND q.question_text = $$Given an unsorted array of integers, find the length of the longest consecutive elements sequence in O(n) time.$$ ORDER BY q.id DESC LIMIT 1), $$def longestConsecutive(nums):
    num_set = set(nums)
    longest = 0
    for n in num_set:
        if n - 1 not in num_set:
            length = 1
            while n + length in num_set:
                length += 1
            longest = max(longest, length)
    return longest$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 228 AND q.question_text = $$Given a sorted unique integer array, return the smallest sorted list of ranges that cover all the numbers.$$ ORDER BY q.id DESC LIMIT 1), $$def summaryRanges(nums):
    res = []
    i = 0
    while i < len(nums):
        start = nums[i]
        while i + 1 < len(nums) and nums[i + 1] == nums[i] + 1:
            i += 1
        res.append(str(start) if start == nums[i] else f'{start}->{nums[i]}')
        i += 1
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 56 AND q.question_text = $$Given an array of intervals, merge all overlapping intervals.$$ ORDER BY q.id DESC LIMIT 1), $$def merge(intervals):
    intervals.sort()
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 57 AND q.question_text = $$Insert a new interval into a sorted non-overlapping list of intervals, merging if necessary.$$ ORDER BY q.id DESC LIMIT 1), $$def insert(intervals, newInterval):
    res = []
    for i, (s, e) in enumerate(intervals):
        if e < newInterval[0]:
            res.append([s, e])
        elif s > newInterval[1]:
            res.append(newInterval)
            return res + intervals[i:]
        else:
            newInterval = [min(s, newInterval[0]), max(e, newInterval[1])]
    res.append(newInterval)
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 452 AND q.question_text = $$Given balloons as intervals on the x-axis, find the minimum number of arrows (vertical lines) to burst all balloons.$$ ORDER BY q.id DESC LIMIT 1), $$def findMinArrowShots(points):
    points.sort(key=lambda x: x[1])
    arrows = 1
    end = points[0][1]
    for s, e in points[1:]:
        if s > end:
            arrows += 1
            end = e
    return arrows$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 71 AND q.question_text = $$Given an absolute Unix file path, simplify it to its canonical form.$$ ORDER BY q.id DESC LIMIT 1), $$def simplifyPath(path):
    stack = []
    for part in path.split('/'):
        if part == '..':
            if stack:
                stack.pop()
        elif part and part != '.':
            stack.append(part)
    return '/' + '/'.join(stack)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 150 AND q.question_text = $$Evaluate an arithmetic expression in Reverse Polish Notation (postfix).$$ ORDER BY q.id DESC LIMIT 1), $$def evalRPN(tokens):
    stack = []
    for t in tokens:
        if t in '+-*/':
            b, a = stack.pop(), stack.pop()
            if t == '+': stack.append(a + b)
            elif t == '-': stack.append(a - b)
            elif t == '*': stack.append(a * b)
            else: stack.append(int(a / b))
        else:
            stack.append(int(t))
    return stack[0]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 224 AND q.question_text = $$Implement a basic calculator to evaluate a string expression with +, -, and parentheses.$$ ORDER BY q.id DESC LIMIT 1), $$def calculate(s):
    stack = []
    num = 0
    sign = 1
    result = 0
    for c in s:
        if c.isdigit():
            num = num * 10 + int(c)
        elif c in '+-':
            result += sign * num
            sign = 1 if c == '+' else -1
            num = 0
        elif c == '(':
            stack.append(result)
            stack.append(sign)
            result = 0
            sign = 1
            num = 0
        elif c == ')':
            result += sign * num
            result *= stack.pop()
            result = stack.pop() + result
            num = 0
    return result + sign * num$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 141 AND q.question_text = $$Given head of a linked list, determine if the list has a cycle.$$ ORDER BY q.id DESC LIMIT 1), $$def hasCycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            return True
    return False$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 2 AND q.question_text = $$Two non-empty linked lists represent non-negative integers in reverse order. Return their sum as a linked list.$$ ORDER BY q.id DESC LIMIT 1), $$def addTwoNumbers(l1, l2):
    dummy = ListNode()
    cur = dummy
    carry = 0
    while l1 or l2 or carry:
        val = carry
        if l1:
            val += l1.val
            l1 = l1.next
        if l2:
            val += l2.val
            l2 = l2.next
        carry = val // 10
        cur.next = ListNode(val % 10)
        cur = cur.next
    return dummy.next$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 21 AND q.question_text = $$Merge two sorted linked lists into one sorted list.$$ ORDER BY q.id DESC LIMIT 1), $$def mergeTwoLists(l1, l2):
    dummy = ListNode()
    cur = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            cur.next = l1
            l1 = l1.next
        else:
            cur.next = l2
            l2 = l2.next
        cur = cur.next
    cur.next = l1 or l2
    return dummy.next$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 138 AND q.question_text = $$Deep copy a linked list where each node has a next pointer and a random pointer.$$ ORDER BY q.id DESC LIMIT 1), $$def copyRandomList(head):
    if not head:
        return None
    old_to_new = {}
    cur = head
    while cur:
        old_to_new[cur] = Node(cur.val)
        cur = cur.next
    cur = head
    while cur:
        old_to_new[cur].next = old_to_new.get(cur.next)
        old_to_new[cur].random = old_to_new.get(cur.random)
        cur = cur.next
    return old_to_new[head]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 92 AND q.question_text = $$Reverse the nodes of a linked list from position left to position right.$$ ORDER BY q.id DESC LIMIT 1), $$def reverseBetween(head, left, right):
    dummy = ListNode(0, head)
    prev = dummy
    for _ in range(left - 1):
        prev = prev.next
    cur = prev.next
    for _ in range(right - left):
        temp = cur.next
        cur.next = temp.next; temp.next = prev.next
        prev.next = temp
    return dummy.next$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 25 AND q.question_text = $$Reverse every k consecutive nodes in a linked list. If remaining nodes < k, leave them as is.$$ ORDER BY q.id DESC LIMIT 1), $$def reverseKGroup(head, k):
    dummy = ListNode(0, head)
    prev_group = dummy
    while True:
        kth = prev_group
        for _ in range(k):
            kth = kth.next
            if not kth:
                return dummy.next
        next_group = kth.next
        prev, cur = next_group, prev_group.next
        for _ in range(k):
            nxt = cur.next; cur.next = prev
            prev = cur
            cur = nxt
        prev_group.next = kth if kth else prev
        prev_group = head
        head = next_group$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 19 AND q.question_text = $$Remove the nth node from the end of a linked list and return the head.$$ ORDER BY q.id DESC LIMIT 1), $$def removeNthFromEnd(head, n):
    dummy = ListNode(0, head)
    fast = slow = dummy
    for _ in range(n + 1):
        fast = fast.next
    while fast:
        fast = fast.next
        slow = slow.next
    slow.next = slow.next.next
    return dummy.next$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 82 AND q.question_text = $$Given the head of a sorted linked list, delete all nodes with duplicate numbers, leaving only distinct values.$$ ORDER BY q.id DESC LIMIT 1), $$def deleteDuplicates(head):
    dummy = ListNode(0, head)
    prev = dummy
    while head:
        if head.next and head.val == head.next.val:
            while head.next and head.val == head.next.val:
                head = head.next
            prev.next = head.next
        else:
            prev = prev.next
        head = head.next
    return dummy.next$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 61 AND q.question_text = $$Given a linked list, rotate the list to the right by k places.$$ ORDER BY q.id DESC LIMIT 1), $$def rotateRight(head, k):
    if not head or not head.next or k == 0:
        return head
    length = 1
    tail = head
    while tail.next:
        tail = tail.next
        length += 1
    k %= length
    if k == 0:
        return head
    tail.next = head
    cur = head
    for _ in range(length - k - 1):
        cur = cur.next
    new_head = cur.next
    cur.next = None
    return new_head$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 86 AND q.question_text = $$Given a linked list and a value x, partition it so all nodes < x come before nodes >= x, preserving order.$$ ORDER BY q.id DESC LIMIT 1), $$def partition(head, x):
    before = ListNode(0)
    after = ListNode(0)
    b, a = before, after
    while head:
        if head.val < x:
            b.next = head
            b = b.next
        else:
            a.next = head
            a = a.next
        head = head.next
    a.next = None
    b.next = after.next
    return before.next$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 146 AND q.question_text = $$Design a data structure for a Least Recently Used (LRU) cache with get and put in O(1).$$ ORDER BY q.id DESC LIMIT 1), $$from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        self.cache = OrderedDict()
        self.cap = capacity

    def get(self, key):
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.cap:
            self.cache.popitem(last=False)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 105 AND q.question_text = $$Given preorder and inorder traversal arrays, construct the binary tree.$$ ORDER BY q.id DESC LIMIT 1), $$def buildTree(preorder, inorder):
    if not preorder:
        return None
    root = TreeNode(preorder[0])
    mid = inorder.index(preorder[0])
    root.left = buildTree(preorder[1:mid + 1], inorder[:mid])
    root.right = buildTree(preorder[mid + 1:], inorder[mid + 1:])
    return root$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 106 AND q.question_text = $$Given inorder and postorder traversal arrays, construct the binary tree.$$ ORDER BY q.id DESC LIMIT 1), $$def buildTree(inorder, postorder):
    if not postorder:
        return None
    root = TreeNode(postorder[-1])
    mid = inorder.index(postorder[-1])
    root.left = buildTree(inorder[:mid], postorder[:mid])
    root.right = buildTree(inorder[mid + 1:], postorder[mid:-1])
    return root$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 117 AND q.question_text = $$Populate each node's next pointer to point to its next right node. If there is no next right node, set it to NULL.$$ ORDER BY q.id DESC LIMIT 1), $$def connect(root):
    node = root
    while node:
        dummy = ListNode(0)
        cur = dummy
        while node:
            if node.left:
                cur.next = node.left
                cur = cur.next
            if node.right:
                cur.next = node.right
                cur = cur.next
            node = node.next
        node = dummy.next
    return root$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 114 AND q.question_text = $$Flatten a binary tree to a linked list in-place using preorder traversal.$$ ORDER BY q.id DESC LIMIT 1), $$def flatten(root):
    cur = root
    while cur:
        if cur.left:
            prev = cur.left
            while prev.right:
                prev = prev.right
            prev.right = cur.right
            cur.right = cur.left
            cur.left = None
        cur = cur.right$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 129 AND q.question_text = $$Each root-to-leaf path represents a number. Return the total sum of all root-to-leaf numbers.$$ ORDER BY q.id DESC LIMIT 1), $$def sumNumbers(root, cur=0):
    if not root:
        return 0
    cur = cur * 10 + root.val
    if not root.left and not root.right:
        return cur
    return sumNumbers(root.left, cur) + sumNumbers(root.right, cur)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 124 AND q.question_text = $$Find the maximum path sum in a binary tree. A path can start and end at any node.$$ ORDER BY q.id DESC LIMIT 1), $$def maxPathSum(root):
    ans = [float('-inf')]
    def dfs(node):
        if not node:
            return 0
        left = max(dfs(node.left), 0)
        right = max(dfs(node.right), 0)
        ans[0] = max(ans[0], node.val + left + right)
        return node.val + max(left, right)
    dfs(root)
    return ans[0]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 173 AND q.question_text = $$Implement an iterator over a BST with next() and hasNext() in O(h) space.$$ ORDER BY q.id DESC LIMIT 1), $$class BSTIterator:
    def __init__(self, root):
        self.stack = []
        self._push_left(root)

    def _push_left(self, node):
        while node:
            self.stack.append(node)
            node = node.left

    def next(self):
        node = self.stack.pop()
        self._push_left(node.right)
        return node.val

    def hasNext(self):
        return len(self.stack) > 0$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 222 AND q.question_text = $$Count the number of nodes in a complete binary tree in less than O(n) time.$$ ORDER BY q.id DESC LIMIT 1), $$def countNodes(root):
    if not root:
        return 0
    left_h = right_h = 0
    l, r = root, root
    while l:
        left_h += 1
        l = l.left
    while r:
        right_h += 1
        r = r.right
    if left_h == right_h:
        return 2 ** left_h - 1
    return 1 + countNodes(root.left) + countNodes(root.right)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 236 AND q.question_text = $$Given a binary tree, find the lowest common ancestor (LCA) of two given nodes.$$ ORDER BY q.id DESC LIMIT 1), $$def lowestCommonAncestor(root, p, q):
    if not root or root == p or root == q:
        return root
    left = lowestCommonAncestor(root.left, p, q)
    right = lowestCommonAncestor(root.right, p, q)
    if left and right: return root
    return left or right$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 199 AND q.question_text = $$Given the root of a binary tree, return the values of nodes visible from the right side.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import deque

def rightSideView(root):
    if not root:
        return []
    res = []
    q = deque([root])
    while q:
        res.append(q[-1].val)
        for _ in range(len(q)):
            node = q.popleft()
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 637 AND q.question_text = $$Given the root of a binary tree, return the average value of nodes on each level.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import deque

def averageOfLevels(root):
    res = []
    q = deque([root])
    while q:
        level_sum = 0
        size = len(q)
        for _ in range(size):
            node = q.popleft()
            level_sum += node.val
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        res.append(level_sum / size)
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 102 AND q.question_text = $$Given the root of a binary tree, return the level order traversal as a list of lists.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import deque

def levelOrder(root):
    if not root:
        return []
    res = []
    q = deque([root])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        res.append(level)
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 103 AND q.question_text = $$Return the zigzag level order traversal of a binary tree (alternating left-to-right and right-to-left).$$ ORDER BY q.id DESC LIMIT 1), $$from collections import deque

def zigzagLevelOrder(root):
    if not root:
        return []
    res = []
    q = deque([root])
    left_to_right = True
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        res.append(level if left_to_right else level[::-1])
        left_to_right = not left_to_right
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 230 AND q.question_text = $$Given the root of a BST, return the kth smallest value.$$ ORDER BY q.id DESC LIMIT 1), $$def kthSmallest(root, k):
    stack = []
    cur = root
    while cur or stack:
        while cur:
            stack.append(cur)
            cur = cur.left
        cur = stack.pop()
        k -= 1
        if k == 0:
            return cur.val
        cur = cur.right$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 98 AND q.question_text = $$Determine if a binary tree is a valid BST.$$ ORDER BY q.id DESC LIMIT 1), $$def isValidBST(root, lo=float('-inf'), hi=float('inf')):
    if not root:
        return True
    if root.val <= lo or root.val >= hi:
        return False
    return isValidBST(root.left, lo, root.val) and isValidBST(root.right, root.val, hi)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 200 AND q.question_text = $$Given a 2D grid of "1"s (land) and "0"s (water), count the number of islands.$$ ORDER BY q.id DESC LIMIT 1), $$def numIslands(grid):
    def dfs(i, j):
        if i < 0 or i >= len(grid) or j < 0 or j >= len(grid[0]) or grid[i][j] != '1':
            return
        grid[i][j] = '0'
        dfs(i + 1, j); dfs(i - 1, j); dfs(i, j + 1); dfs(i, j - 1)
    count = 0
    for i in range(len(grid)):
        for j in range(len(grid[0])):
            if grid[i][j] == '1':
                dfs(i, j)
                count += 1
    return count$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 130 AND q.question_text = $$Capture all "O" regions that are fully surrounded by "X" by flipping them to "X".$$ ORDER BY q.id DESC LIMIT 1), $$def solve(board):
    if not board:
        return
    m, n = len(board), len(board[0])
    def dfs(i, j):
        if i < 0 or i >= m or j < 0 or j >= n or board[i][j] != 'O':
            return
        board[i][j] = 'S'
        dfs(i + 1, j); dfs(i - 1, j); dfs(i, j + 1); dfs(i, j - 1)
    for i in range(m):
        for j in range(n):
            if (i in (0, m - 1) or j in (0, n - 1)) and board[i][j] == 'O':
                dfs(i, j)
    for i in range(m):
        for j in range(n):
            if board[i][j] == 'O':
                board[i][j] = 'X'
            elif board[i][j] == 'S':
                board[i][j] = 'O'$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 133 AND q.question_text = $$Given a reference of a node in a connected undirected graph, return a deep copy.$$ ORDER BY q.id DESC LIMIT 1), $$def cloneGraph(node):
    if not node:
        return None
    clones = {}
    def dfs(n):
        if n in clones:
            return clones[n]
        clone = Node(n.val)
        clones[n] = clone
        clone.neighbors = [dfs(nb) for nb in n.neighbors]
        return clone
    return dfs(node)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 399 AND q.question_text = $$Given equations a/b=k, answer queries a/c by traversing the graph of ratios.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import defaultdict

def calcEquation(equations, values, queries):
    graph = defaultdict(dict)
    for (a, b), v in zip(equations, values):
        graph[a][b] = v
        graph[b][a] = 1.0 / v
    def dfs(src, dst, visited):
        if src not in graph or dst not in graph:
            return -1.0
        if src == dst:
            return 1.0
        visited.add(src)
        for nei, w in graph[src].items():
            if nei not in visited:
                res = dfs(nei, dst, visited)
                if res != -1.0:
                    return w * res
        return -1.0
    return [dfs(a, b, set()) for a, b in queries]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 207 AND q.question_text = $$There are numCourses courses with prerequisites. Determine if you can finish all courses (no cycles).$$ ORDER BY q.id DESC LIMIT 1), $$def canFinish(numCourses, prerequisites):
    graph = [[] for _ in range(numCourses)]
    indegree = [0] * numCourses
    for a, b in prerequisites:
        graph[b].append(a)
        indegree[a] += 1
    queue = [i for i in range(numCourses) if indegree[i] == 0]
    count = 0
    while queue:
        node = queue.pop()
        count += 1
        for nei in graph[node]:
            indegree[nei] -= 1
            if indegree[nei] == 0:
                queue.append(nei)
    return count == numCourses$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 210 AND q.question_text = $$Return the ordering of courses you should take to finish all courses, or an empty array if impossible.$$ ORDER BY q.id DESC LIMIT 1), $$def findOrder(numCourses, prerequisites):
    graph = [[] for _ in range(numCourses)]
    indegree = [0] * numCourses
    for a, b in prerequisites:
        graph[b].append(a)
        indegree[a] += 1
    queue = [i for i in range(numCourses) if indegree[i] == 0]
    order = []
    while queue:
        node = queue.pop()
        order.append(node)
        for nei in graph[node]:
            indegree[nei] -= 1
            if indegree[nei] == 0:
                queue.append(nei)
    return order if len(order) == numCourses else []$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 909 AND q.question_text = $$Return the minimum number of dice rolls to reach the last square on a Snakes and Ladders board.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import deque

def snakesAndLadders(board):
    n = len(board)
    def get_pos(s):
        r, c = divmod(s - 1, n)
        if r % 2 == 1:
            c = n - 1 - c
        return n - 1 - r, c
    visited = set()
    q = deque([(1, 0)])
    while q:
        s, moves = q.popleft()
        for i in range(1, 7):
            ns = s + i
            r, c = get_pos(ns)
            if board[r][c] != -1:
                ns = board[r][c]
            if ns == n * n:
                return moves + 1
            if ns not in visited:
                visited.add(ns)
                q.append((ns, moves + 1))
    return -1$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 433 AND q.question_text = $$Find the minimum number of mutations to go from startGene to endGene. Each mutation changes one char and must be in the bank.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import deque

def minMutation(startGene, endGene, bank):
    bank_set = set(bank)
    if endGene not in bank_set:
        return -1
    q = deque([(startGene, 0)])
    visited = {startGene}
    while q:
        gene, steps = q.popleft()
        for i in range(8):
            for c in 'ACGT':
                mutation = gene[:i] + c + gene[i + 1:]
                if mutation in bank_set and mutation not in visited:
                    if mutation == endGene:
                        return steps + 1
                    visited.add(mutation)
                    q.append((mutation, steps + 1))
    return -1$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 127 AND q.question_text = $$Given beginWord, endWord, and a wordList, find the length of the shortest transformation sequence (each step changes one letter).$$ ORDER BY q.id DESC LIMIT 1), $$from collections import deque

def ladderLength(beginWord, endWord, wordList):
    word_set = set(wordList)
    if endWord not in word_set:
        return 0
    q = deque([(beginWord, 1)])
    visited = {beginWord}
    while q:
        word, length = q.popleft()
        for i in range(len(word)):
            for c in 'abcdefghijklmnopqrstuvwxyz':
                nw = word[:i] + c + word[i + 1:]
                if nw == endWord:
                    return length + 1
                if nw in word_set and nw not in visited:
                    visited.add(nw)
                    q.append((nw, length + 1))
    return 0$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 208 AND q.question_text = $$Implement a Trie with insert, search, and startsWith methods.$$ ORDER BY q.id DESC LIMIT 1), $$class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for c in word:
            if c not in node.children:
                node.children[c] = TrieNode()
            node = node.children[c]
        node.is_end = True

    def search(self, word):
        node = self._find(word)
        return node is not None and node.is_end

    def startsWith(self, prefix):
        return self._find(prefix) is not None

    def _find(self, word):
        node = self.root
        for c in word:
            if c not in node.children:
                return None
            node = node.children[c]
        return node$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 211 AND q.question_text = $$Design a data structure supporting addWord and search where "." matches any letter.$$ ORDER BY q.id DESC LIMIT 1), $$class WordDictionary:
    def __init__(self):
        self.children = {}
        self.is_end = False

    def addWord(self, word):
        node = self
        for c in word:
            if c not in node.children:
                node.children[c] = WordDictionary()
            node = node.children[c]
        node.is_end = True

    def search(self, word, node=None):
        node = node or self
        for i, c in enumerate(word):
            if c == '.':
                return any(self.search(word[i + 1:], child) for child in node.children.values())
            if c not in node.children:
                return False
            node = node.children[c]
        return node.is_end$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 212 AND q.question_text = $$Given a 2D board and a list of words, return all words that can be formed by sequentially adjacent cells.$$ ORDER BY q.id DESC LIMIT 1), $$def findWords(board, words):
    root = {}
    for w in words:
        node = root
        for c in w:
            node = node.setdefault(c, {})
        node['#'] = w
    m, n = len(board), len(board[0])
    res = []
    def dfs(i, j, node):
        c = board[i][j]
        if c not in node:
            return
        nxt = node[c]
        if '#' in nxt:
            res.append(nxt.pop('#'))
        board[i][j] = '.'
        for di, dj in ((0,1),(0,-1),(1,0),(-1,0)):
            ni, nj = i + di, j + dj
            if 0 <= ni < m and 0 <= nj < n:
                dfs(ni, nj, nxt)
        board[i][j] = c
    for i in range(m):
        for j in range(n):
            dfs(i, j, root)
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 17 AND q.question_text = $$Given a string of digits 2-9, return all possible letter combinations (phone keypad mapping).$$ ORDER BY q.id DESC LIMIT 1), $$def letterCombinations(digits):
    if not digits:
        return []
    phone = {'2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl',
             '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz'}
    res = []
    def backtrack(i, cur):
        if i == len(digits):
            res.append(cur)
            return
        for c in phone[digits[i]]:
            backtrack(i + 1, cur + c)
    backtrack(0, '')
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 77 AND q.question_text = $$Given two integers n and k, return all possible combinations of k numbers from [1, n].$$ ORDER BY q.id DESC LIMIT 1), $$def combine(n, k):
    res = []
    def backtrack(start, combo):
        if len(combo) == k:
            res.append(combo[:])
            return
        for i in range(start, n + 1):
            combo.append(i)
            backtrack(i + 1, combo)
            combo.pop()
    backtrack(1, [])
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 46 AND q.question_text = $$Given an array of distinct integers, return all possible permutations.$$ ORDER BY q.id DESC LIMIT 1), $$def permute(nums):
    res = []
    def backtrack(path, remaining):
        if not remaining:
            res.append(path)
            return
        for i in range(len(remaining)):
            backtrack(path + [remaining[i]], remaining[:i] + remaining[i + 1:])
    backtrack([], nums)
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 39 AND q.question_text = $$Given an array of distinct integers and a target, return all unique combinations that sum to target. Numbers may be reused.$$ ORDER BY q.id DESC LIMIT 1), $$def combinationSum(candidates, target):
    res = []
    def backtrack(start, combo, total):
        if total == target:
            res.append(combo[:])
            return
        if total > target:
            return
        for i in range(start, len(candidates)):
            combo.append(candidates[i])
            backtrack(i, combo, total + candidates[i])
            combo.pop()
    backtrack(0, [], 0)
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 52 AND q.question_text = $$Return the number of distinct solutions to the n-queens puzzle.$$ ORDER BY q.id DESC LIMIT 1), $$def totalNQueens(n):
    count = [0]
    cols = set()
    diag1 = set()
    diag2 = set()
    def backtrack(row):
        if row == n:
            count[0] += 1
            return
        for col in range(n):
            if col in cols or row - col in diag1 or row + col in diag2:
                continue
            cols.add(col); diag1.add(row - col); diag2.add(row + col)
            backtrack(row + 1)
            cols.remove(col); diag1.remove(row - col); diag2.remove(row + col)
    backtrack(0)
    return count[0]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 22 AND q.question_text = $$Given n pairs of parentheses, generate all valid combinations.$$ ORDER BY q.id DESC LIMIT 1), $$def generateParenthesis(n):
    res = []
    def backtrack(s, open_count, close_count):
        if len(s) == 2 * n:
            res.append(s)
            return
        if open_count < n:
            backtrack(s + '(', open_count + 1, close_count)
        if close_count < open_count:
            backtrack(s + ')', open_count, close_count + 1)
    backtrack('', 0, 0)
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 79 AND q.question_text = $$Given a 2D board and a word, determine if the word exists in the grid by moving to adjacent cells.$$ ORDER BY q.id DESC LIMIT 1), $$def exist(board, word):
    m, n = len(board), len(board[0])
    def dfs(i, j, k):
        if k == len(word):
            return True
        if i < 0 or i >= m or j < 0 or j >= n or board[i][j] != word[k]:
            return False
        tmp = board[i][j]
        board[i][j] = '#'
        found = dfs(i+1,j,k+1) or dfs(i-1,j,k+1) or dfs(i,j+1,k+1) or dfs(i,j-1,k+1)
        board[i][j] = tmp
        return found
    for i in range(m):
        for j in range(n):
            if dfs(i, j, 0):
                return True
    return False$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 108 AND q.question_text = $$Given a sorted array, convert it to a height-balanced BST.$$ ORDER BY q.id DESC LIMIT 1), $$def sortedArrayToBST(nums):
    if not nums:
        return None
    mid = len(nums) // 2
    root = TreeNode(nums[mid])
    root.left = sortedArrayToBST(nums[:mid])
    root.right = sortedArrayToBST(nums[mid + 1:])
    return root$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 148 AND q.question_text = $$Sort a linked list in O(n log n) time and O(1) space.$$ ORDER BY q.id DESC LIMIT 1), $$def sortList(head):
    if not head or not head.next:
        return head
    slow, fast = head, head.next
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    mid = slow.next
    slow.next = None
    left = sortList(head)
    right = sortList(mid)
    return merge(left, right)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 427 AND q.question_text = $$Given an n x n grid of 0s and 1s, construct a Quad-Tree representation.$$ ORDER BY q.id DESC LIMIT 1), $$def construct(grid):
    def build(r, c, size):
        if size == 1:
            return Node(grid[r][c] == 1, True)
        half = size // 2
        tl = build(r, c, half)
        tr = build(r, c + half, half)
        bl = build(r + half, c, half)
        br = build(r + half, c + half, half)
        if tl.isLeaf and tr.isLeaf and bl.isLeaf and br.isLeaf and tl.val == tr.val == bl.val == br.val:
            return Node(tl.val, True)
        return Node(False, False, tl, tr, bl, br)
    return build(0, 0, len(grid))$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 23 AND q.question_text = $$Merge k sorted linked lists into one sorted linked list.$$ ORDER BY q.id DESC LIMIT 1), $$import heapq

def mergeKLists(lists):
    heap = []
    for i, l in enumerate(lists):
        if l:
            heapq.heappush(heap, (l.val, i, l))
    dummy = ListNode()
    cur = dummy
    while heap:
        val, i, node = heapq.heappop(heap)
        cur.next = node
        cur = cur.next
        if node.next:
            heapq.heappush(heap, (node.next.val, i, node.next))
    return dummy.next$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 53 AND q.question_text = $$Find the contiguous subarray with the largest sum.$$ ORDER BY q.id DESC LIMIT 1), $$def maxSubArray(nums):
    max_sum = cur_sum = nums[0]
    for num in nums[1:]:
        cur_sum = max(num, cur_sum + num)
        max_sum = max(max_sum, cur_sum)
    return max_sum$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 918 AND q.question_text = $$Given a circular integer array, find the maximum possible subarray sum.$$ ORDER BY q.id DESC LIMIT 1), $$def maxSubarraySumCircular(nums):
    total = 0
    max_sum = cur_max = nums[0]
    min_sum = cur_min = nums[0]
    for num in nums[1:]:
        cur_max = max(num, cur_max + num)
        max_sum = max(max_sum, cur_max)
        cur_min = min(num, cur_min + num)
        min_sum = min(min_sum, cur_min)
        total += num
    total += nums[0]
    return max(max_sum, total - min_sum) if max_sum > 0 else max_sum$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 35 AND q.question_text = $$Given a sorted array and a target, return the index where it would be inserted.$$ ORDER BY q.id DESC LIMIT 1), $$def searchInsert(nums, target):
    l, r = 0, len(nums) - 1
    while l <= r:
        mid = (l + r) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            l = mid + 1
        else:
            r = mid - 1
    return l$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 74 AND q.question_text = $$Search for a target in a sorted m x n matrix where each row follows the previous row's last element.$$ ORDER BY q.id DESC LIMIT 1), $$def searchMatrix(matrix, target):
    m, n = len(matrix), len(matrix[0])
    l, r = 0, m * n - 1
    while l <= r:
        mid = (l + r) // 2
        val = matrix[mid // n][mid % n]
        if val == target:
            return True
        elif val < target:
            l = mid + 1
        else:
            r = mid - 1
    return False$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 162 AND q.question_text = $$Find a peak element in an array (strictly greater than neighbors) and return its index.$$ ORDER BY q.id DESC LIMIT 1), $$def findPeakElement(nums):
    l, r = 0, len(nums) - 1
    while l < r:
        mid = (l + r) // 2
        if nums[mid] > nums[mid + 1]:
            r = mid
        else:
            l = mid + 1
    return l$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 33 AND q.question_text = $$Search for a target in a rotated sorted array. Return its index or -1.$$ ORDER BY q.id DESC LIMIT 1), $$def search(nums, target):
    l, r = 0, len(nums) - 1
    while l <= r:
        mid = (l + r) // 2
        if nums[mid] == target:
            return mid
        if nums[l] <= nums[mid]:
            if nums[l] <= target < nums[mid]:
                r = mid - 1
            else:
                l = mid + 1
        else:
            if nums[mid] < target <= nums[r]:
                l = mid + 1
            else:
                r = mid - 1
    return -1$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 34 AND q.question_text = $$Find the starting and ending position of a given target in a sorted array.$$ ORDER BY q.id DESC LIMIT 1), $$def searchRange(nums, target):
    def bisect(left_bias):
        l, r = 0, len(nums) - 1
        idx = -1
        while l <= r:
            mid = (l + r) // 2
            if nums[mid] == target:
                idx = mid
                if left_bias: r = mid - 1
                else: l = mid + 1
            elif nums[mid] < target:
                l = mid + 1
            else:
                r = mid - 1
        return idx
    return [bisect(True), bisect(False)]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 153 AND q.question_text = $$Find the minimum element in a rotated sorted array (no duplicates).$$ ORDER BY q.id DESC LIMIT 1), $$def findMin(nums):
    l, r = 0, len(nums) - 1
    while l < r:
        mid = (l + r) // 2
        if nums[mid] > nums[r]:
            l = mid + 1
        else:
            r = mid
    return nums[l]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 4 AND q.question_text = $$Given two sorted arrays, return the median of the combined array in O(log(m+n)).$$ ORDER BY q.id DESC LIMIT 1), $$def findMedianSortedArrays(nums1, nums2):
    if len(nums1) > len(nums2):
        nums1, nums2 = nums2, nums1
    m, n = len(nums1), len(nums2)
    l, r = 0, m
    while l <= r:
        i = (l + r) // 2
        j = (m + n + 1) // 2 - i
        left1 = nums1[i - 1] if i > 0 else float('-inf')
        right1 = nums1[i] if i < m else float('inf')
        left2 = nums2[j - 1] if j > 0 else float('-inf')
        right2 = nums2[j] if j < n else float('inf')
        if left1 <= right2 and left2 <= right1:
            if (m + n) % 2 == 0: return (max(left1, left2) + min(right1, right2)) / 2
            else: return max(left1, left2)
        elif left1 > right2:
            r = i - 1
        else:
            l = i + 1$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 215 AND q.question_text = $$Find the kth largest element in an unsorted array.$$ ORDER BY q.id DESC LIMIT 1), $$import heapq

def findKthLargest(nums, k):
    heap = []
    for num in nums:
        heapq.heappush(heap, num)
        if len(heap) > k:
            heapq.heappop(heap)
    return heap[0]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 502 AND q.question_text = $$Maximize capital after completing at most k projects. Each project has a profit and minimum capital requirement.$$ ORDER BY q.id DESC LIMIT 1), $$import heapq

def findMaximizedCapital(k, w, profits, capital):
    projects = sorted(zip(capital, profits))
    heap = []
    i = 0
    for _ in range(k):
        while i < len(projects) and projects[i][0] <= w:
            heapq.heappush(heap, -projects[i][1])
            i += 1
        if not heap:
            break
        w += -heapq.heappop(heap)
    return w$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 373 AND q.question_text = $$Given two sorted arrays, find k pairs (u, v) with the smallest sums.$$ ORDER BY q.id DESC LIMIT 1), $$import heapq

def kSmallestPairs(nums1, nums2, k):
    if not nums1 or not nums2:
        return []
    heap = [(nums1[i] + nums2[0], i, 0) for i in range(min(k, len(nums1)))]
    heapq.heapify(heap)
    res = []
    while heap and len(res) < k:
        s, i, j = heapq.heappop(heap)
        res.append([nums1[i], nums2[j]])
        if j + 1 < len(nums2):
            heapq.heappush(heap, (nums1[i] + nums2[j + 1], i, j + 1))
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 295 AND q.question_text = $$Design a data structure that supports addNum and findMedian for a stream of integers.$$ ORDER BY q.id DESC LIMIT 1), $$import heapq

class MedianFinder:
    def __init__(self):
        self.lo = []  # max-heap (negated)
        self.hi = []  # min-heap

    def addNum(self, num):
        heapq.heappush(self.lo, -num)
        heapq.heappush(self.hi, -heapq.heappop(self.lo))
        if self.hi and -self.lo[0] > self.hi[0]: heapq.heappush(self.lo, -heapq.heappop(self.hi))
        if len(self.lo) > len(self.hi) + 1:
            heapq.heappush(self.hi, -heapq.heappop(self.lo))

    def findMedian(self):
        if len(self.lo) > len(self.hi):
            return -self.lo[0]
        return (-self.lo[0] + self.hi[0]) / 2$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 67 AND q.question_text = $$Given two binary strings, return their sum as a binary string.$$ ORDER BY q.id DESC LIMIT 1), $$def addBinary(a, b):
    result = []
    carry = 0
    i, j = len(a) - 1, len(b) - 1
    while i >= 0 or j >= 0 or carry:
        total = carry
        if i >= 0:
            total += int(a[i]); i -= 1
        if j >= 0:
            total += int(b[j]); j -= 1
        result.append(str(total % 2))
        carry = total // 2
    return ''.join(reversed(result))$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 190 AND q.question_text = $$Reverse the bits of a given 32-bit unsigned integer.$$ ORDER BY q.id DESC LIMIT 1), $$def reverseBits(n):
    result = 0
    for _ in range(32):
        result = (result << 1) | (n & 1)
        n >>= 1
    return result$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 191 AND q.question_text = $$Return the number of 1 bits in the binary representation of an unsigned integer.$$ ORDER BY q.id DESC LIMIT 1), $$def hammingWeight(n):
    count = 0
    while n:
        n &= n - 1
        count += 1
    return count$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 136 AND q.question_text = $$Every element appears twice except one. Find the single element.$$ ORDER BY q.id DESC LIMIT 1), $$def singleNumber(nums):
    result = 0
    for num in nums:
        result ^= num
    return result$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 137 AND q.question_text = $$Every element appears three times except one. Find the single element.$$ ORDER BY q.id DESC LIMIT 1), $$def singleNumber(nums):
    ones = twos = 0
    for num in nums:
        ones = (ones ^ num) & ~twos
        twos = (twos ^ num) & ~ones
    return ones$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 201 AND q.question_text = $$Given a range [left, right], return the bitwise AND of all numbers in the range.$$ ORDER BY q.id DESC LIMIT 1), $$def rangeBitwiseAnd(left, right):
    shift = 0
    while left != right:
        left >>= 1
        right >>= 1
        shift += 1
    return left << shift$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 9 AND q.question_text = $$Determine whether an integer is a palindrome without converting to string.$$ ORDER BY q.id DESC LIMIT 1), $$def isPalindrome(x):
    if x < 0 or (x % 10 == 0 and x != 0):
        return False
    rev = 0
    while x > rev:
        rev = rev * 10 + x % 10
        x //= 10
    return x == rev or x == rev // 10$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 66 AND q.question_text = $$Given a large integer as an array of digits, add one to it.$$ ORDER BY q.id DESC LIMIT 1), $$def plusOne(digits):
    for i in range(len(digits) - 1, -1, -1):
        if digits[i] < 9:
            digits[i] += 1
            return digits
        digits[i] = 0
    return [1] + digits$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 172 AND q.question_text = $$Given an integer n, return the number of trailing zeroes in n!.$$ ORDER BY q.id DESC LIMIT 1), $$def trailingZeroes(n):
    count = 0
    while n >= 5:
        n //= 5
        count += n
    return count$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 69 AND q.question_text = $$Compute the integer square root of x (truncated).$$ ORDER BY q.id DESC LIMIT 1), $$def mySqrt(x):
    l, r = 0, x
    while l <= r:
        mid = (l + r) // 2
        if mid * mid <= x:
            ans = mid
            l = mid + 1
        else:
            r = mid - 1
    return ans$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 50 AND q.question_text = $$Implement pow(x, n) computing x raised to the power n.$$ ORDER BY q.id DESC LIMIT 1), $$def myPow(x, n):
    if n < 0:
        x, n = 1 / x, -n
    result = 1
    while n:
        if n % 2 == 1:
            result *= x
        x *= x
        n //= 2
    return result$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 149 AND q.question_text = $$Given n points on a 2D plane, find the maximum number of points on the same straight line.$$ ORDER BY q.id DESC LIMIT 1), $$from collections import defaultdict
from math import gcd

def maxPoints(points):
    n = len(points)
    if n <= 2:
        return n
    ans = 2
    for i in range(n):
        slopes = defaultdict(int)
        for j in range(i + 1, n):
            dx = points[j][0] - points[i][0]
            dy = points[j][1] - points[i][1]
            g = gcd(dx, dy)
            if g != 0: dx, dy = dx // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1), dy // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1)
            slopes[(dx // g, dy // g)] += 1
        ans = max(ans, max(slopes.values()) + 1)
    return ans$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 70 AND q.question_text = $$You can climb 1 or 2 steps. How many distinct ways can you climb to the top (n steps)?$$ ORDER BY q.id DESC LIMIT 1), $$def climbStairs(n):
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 198 AND q.question_text = $$Given an array of house values, find the maximum money you can rob without robbing two adjacent houses.$$ ORDER BY q.id DESC LIMIT 1), $$def rob(nums):
    prev1 = prev2 = 0
    for num in nums:
        temp = max(prev1, prev2 + num)
        prev2 = prev1
        prev1 = temp
    return prev1$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 139 AND q.question_text = $$Given a string s and a dictionary wordDict, return true if s can be segmented into dictionary words.$$ ORDER BY q.id DESC LIMIT 1), $$def wordBreak(s, wordDict):
    word_set = set(wordDict)
    dp = [False] * (len(s) + 1)
    dp[0] = True
    for i in range(1, len(s) + 1):
        for j in range(i):
            if dp[j] and s[j:i] in word_set:
                dp[i] = True
                break
    return dp[len(s)]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 322 AND q.question_text = $$Given coin denominations and an amount, return the fewest coins needed to make the amount, or -1.$$ ORDER BY q.id DESC LIMIT 1), $$def coinChange(coins, amount):
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for i in range(1, amount + 1):
        for c in coins:
            if c <= i:
                dp[i] = min(dp[i], dp[i - c] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 300 AND q.question_text = $$Given an integer array, return the length of the longest strictly increasing subsequence.$$ ORDER BY q.id DESC LIMIT 1), $$import bisect

def lengthOfLIS(nums):
    tails = []
    for num in nums:
        pos = bisect.bisect_left(tails, num)
        if pos == len(tails):
            tails.append(num)
        else:
            tails[pos] = num
    return len(tails)$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 120 AND q.question_text = $$Given a triangle array, find the minimum path sum from top to bottom (moving to adjacent numbers on the row below).$$ ORDER BY q.id DESC LIMIT 1), $$def minimumTotal(triangle):
    dp = triangle[-1][:]
    for i in range(len(triangle) - 2, -1, -1):
        for j in range(len(triangle[i])):
            dp[j] = triangle[i][j] + min(dp[j], dp[j + 1])
    return dp[0]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 64 AND q.question_text = $$Given an m x n grid of non-negative numbers, find a path from top-left to bottom-right that minimizes the sum.$$ ORDER BY q.id DESC LIMIT 1), $$def minPathSum(grid):
    m, n = len(grid), len(grid[0])
    for i in range(m):
        for j in range(n):
            if i == 0 and j == 0:
                continue
            elif i == 0:
                grid[i][j] += grid[i][j - 1]
            elif j == 0:
                grid[i][j] += grid[i - 1][j]
            else:
                grid[i][j] += min(grid[i - 1][j], grid[i][j - 1])
    return grid[m - 1][n - 1]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 63 AND q.question_text = $$A robot on an m x n grid with obstacles can move right or down. How many unique paths exist from top-left to bottom-right?$$ ORDER BY q.id DESC LIMIT 1), $$def uniquePathsWithObstacles(grid):
    m, n = len(grid), len(grid[0])
    dp = [0] * n
    dp[0] = 1
    for i in range(m):
        for j in range(n):
            if grid[i][j] == 1:
                dp[j] = 0
            elif j > 0:
                dp[j] += dp[j - 1]
    return dp[n - 1]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 5 AND q.question_text = $$Given a string s, return the longest palindromic substring.$$ ORDER BY q.id DESC LIMIT 1), $$def longestPalindrome(s):
    res = ""
    def expand(l, r):
        nonlocal res
        while l >= 0 and r < len(s) and s[l] == s[r]:
            if r - l + 1 > len(res):
                res = s[l:r + 1]
            l -= 1
            r += 1
    for i in range(len(s)):
        expand(i, i)
        expand(i, i + 1)
    return res$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 97 AND q.question_text = $$Given strings s1, s2, and s3, determine if s3 is formed by interleaving s1 and s2.$$ ORDER BY q.id DESC LIMIT 1), $$def isInterleave(s1, s2, s3):
    if len(s1) + len(s2) != len(s3):
        return False
    dp = [False] * (len(s2) + 1)
    for i in range(len(s1) + 1):
        for j in range(len(s2) + 1):
            if i == 0 and j == 0:
                dp[j] = True
            elif i == 0:
                dp[j] = dp[j - 1] and s2[j - 1] == s3[j - 1]
            elif j == 0:
                dp[j] = dp[j] and s1[i - 1] == s3[i - 1]
            else:
                dp[j] = (dp[j] and s1[i - 1] == s3[i + j - 1]) or (dp[j - 1] and s2[j - 1] == s3[i + j - 1])
    return dp[len(s2)]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 72 AND q.question_text = $$Given two strings word1 and word2, return the minimum edit distance (insert, delete, replace).$$ ORDER BY q.id DESC LIMIT 1), $$def minDistance(word1, word2):
    m, n = len(word1), len(word2)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            if word1[i - 1] == word2[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
    return dp[n]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 123 AND q.question_text = $$Find the maximum profit with at most two transactions.$$ ORDER BY q.id DESC LIMIT 1), $$def maxProfit(prices):
    buy1 = buy2 = float('inf')
    profit1 = profit2 = 0
    for p in prices:
        buy1 = min(buy1, p)
        profit1 = max(profit1, p - buy1)
        buy2 = min(buy2, p - profit1)
        profit2 = max(profit2, p - buy2)
    return profit2$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 188 AND q.question_text = $$Find the maximum profit with at most k transactions.$$ ORDER BY q.id DESC LIMIT 1), $$def maxProfit(k, prices):
    if not prices:
        return 0
    n = len(prices)
    if k >= n // 2:
        return sum(max(0, prices[i] - prices[i - 1]) for i in range(1, n))
    dp = [[0] * n for _ in range(k + 1)]
    for t in range(1, k + 1):
        max_diff = -prices[0]
        for d in range(1, n):
            dp[t][d] = max(dp[t][d - 1], prices[d] + max_diff)
            max_diff = max(max_diff, dp[t - 1][d] - prices[d])
    return dp[k][n - 1]$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 221 AND q.question_text = $$Find the largest square containing only 1s in a binary matrix and return its area.$$ ORDER BY q.id DESC LIMIT 1), $$def maximalSquare(matrix):
    if not matrix:
        return 0
    m, n = len(matrix), len(matrix[0])
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    max_side = 0
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if matrix[i - 1][j - 1] == '1':
                dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1
                max_side = max(max_side, dp[i][j])
    return max_side * max_side$$, 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO question_topics (question_id, topic_id, created_at) VALUES
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 94 AND q.question_text = $$Given a binary tree, return its inorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 94 AND q.question_text = $$Given a binary tree, return its inorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 144 AND q.question_text = $$Given a binary tree, return its preorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 144 AND q.question_text = $$Given a binary tree, return its preorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 145 AND q.question_text = $$Given a binary tree, return its postorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 145 AND q.question_text = $$Given a binary tree, return its postorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 589 AND q.question_text = $$Given an N-ary tree, return its preorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 589 AND q.question_text = $$Given an N-ary tree, return its preorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 589 AND q.question_text = $$Given an N-ary tree, return its preorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'n-ary' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 590 AND q.question_text = $$Given an N-ary tree, return its postorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 590 AND q.question_text = $$Given an N-ary tree, return its postorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 590 AND q.question_text = $$Given an N-ary tree, return its postorder traversal values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'n-ary' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 104 AND q.question_text = $$Return the maximum depth of a binary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 104 AND q.question_text = $$Return the maximum depth of a binary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 111 AND q.question_text = $$Return the minimum depth from root to a leaf.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 111 AND q.question_text = $$Return the minimum depth from root to a leaf.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 559 AND q.question_text = $$Return the maximum depth of an N-ary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 559 AND q.question_text = $$Return the maximum depth of an N-ary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 559 AND q.question_text = $$Return the maximum depth of an N-ary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'n-ary' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 543 AND q.question_text = $$Return the diameter (longest path) of a binary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 543 AND q.question_text = $$Return the diameter (longest path) of a binary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 110 AND q.question_text = $$Return true if the tree is height-balanced.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 110 AND q.question_text = $$Return true if the tree is height-balanced.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 563 AND q.question_text = $$Return the sum of tilt values for all nodes.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 563 AND q.question_text = $$Return the sum of tilt values for all nodes.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 100 AND q.question_text = $$Return true if two binary trees are identical.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 100 AND q.question_text = $$Return true if two binary trees are identical.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 101 AND q.question_text = $$Return true if the tree is a mirror of itself.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 101 AND q.question_text = $$Return true if the tree is a mirror of itself.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 226 AND q.question_text = $$Invert a binary tree (swap left and right).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 226 AND q.question_text = $$Invert a binary tree (swap left and right).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 965 AND q.question_text = $$Return true if all nodes have the same value.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 965 AND q.question_text = $$Return true if all nodes have the same value.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 872 AND q.question_text = $$Return true if two trees have the same leaf sequence.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 872 AND q.question_text = $$Return true if two trees have the same leaf sequence.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 112 AND q.question_text = $$Return true if a root-to-leaf path sums to target.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 112 AND q.question_text = $$Return true if a root-to-leaf path sums to target.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 257 AND q.question_text = $$Return all root-to-leaf paths as strings.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 257 AND q.question_text = $$Return all root-to-leaf paths as strings.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 404 AND q.question_text = $$Return the sum of all left leaf values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 404 AND q.question_text = $$Return the sum of all left leaf values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1022 AND q.question_text = $$Each root-to-leaf path is a binary number; return the sum.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1022 AND q.question_text = $$Each root-to-leaf path is a binary number; return the sum.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 617 AND q.question_text = $$Merge two trees by summing overlapping nodes.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 617 AND q.question_text = $$Merge two trees by summing overlapping nodes.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 572 AND q.question_text = $$Return true if t is a subtree of s.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 572 AND q.question_text = $$Return true if t is a subtree of s.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 700 AND q.question_text = $$Return the node with a given value in a BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 700 AND q.question_text = $$Return the node with a given value in a BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bst' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 938 AND q.question_text = $$Return the sum of values in [low, high] in a BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 938 AND q.question_text = $$Return the sum of values in [low, high] in a BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bst' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 530 AND q.question_text = $$Return the minimum absolute difference between any two nodes in a BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 530 AND q.question_text = $$Return the minimum absolute difference between any two nodes in a BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bst' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 653 AND q.question_text = $$Return true if there exist two values summing to k.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 653 AND q.question_text = $$Return true if there exist two values summing to k.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bst' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 682 AND q.question_text = $$Return the total score after processing all operations.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1598 AND q.question_text = $$Return the minimum operations needed to return to the main folder.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1441 AND q.question_text = $$Return Push/Pop operations to build target from numbers 1..n.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1047 AND q.question_text = $$Repeatedly remove adjacent duplicate letters until none remain.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1544 AND q.question_text = $$Remove adjacent pairs where letters differ only by case.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 844 AND q.question_text = $$Return true if two strings are equal after processing backspaces.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1021 AND q.question_text = $$Remove the outermost parentheses from every primitive segment.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 20 AND q.question_text = $$Return true if brackets are validly matched and ordered.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 155 AND q.question_text = $$Design a stack supporting push, pop, top, and retrieving min in O(1).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 155 AND q.question_text = $$Design a stack supporting push, pop, top, and retrieving min in O(1).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'design' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 232 AND q.question_text = $$Implement FIFO queue operations using two stacks.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 232 AND q.question_text = $$Implement FIFO queue operations using two stacks.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'design' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 225 AND q.question_text = $$Implement LIFO stack operations using queues.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 225 AND q.question_text = $$Implement LIFO stack operations using queues.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'design' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1475 AND q.question_text = $$For each price, subtract the first following price less than or equal to it.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1475 AND q.question_text = $$For each price, subtract the first following price less than or equal to it.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'monotonic-stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 496 AND q.question_text = $$Find the next greater element in nums2 for each value in nums1.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 496 AND q.question_text = $$Find the next greater element in nums2 for each value in nums1.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'monotonic-stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 88 AND q.question_text = $$You are given two integer arrays nums1 and nums2, sorted in non-decreasing order, and two integers m and n representing the number of elements in nums1 and nums2. Merge nums2 into nums1 as one sorted array in-place.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 88 AND q.question_text = $$You are given two integer arrays nums1 and nums2, sorted in non-decreasing order, and two integers m and n representing the number of elements in nums1 and nums2. Merge nums2 into nums1 as one sorted array in-place.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 27 AND q.question_text = $$Given an integer array nums and an integer val, remove all occurrences of val in-place. Return the number of elements not equal to val.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 27 AND q.question_text = $$Given an integer array nums and an integer val, remove all occurrences of val in-place. Return the number of elements not equal to val.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 26 AND q.question_text = $$Given a sorted array nums, remove the duplicates in-place such that each element appears only once. Return the new length.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 26 AND q.question_text = $$Given a sorted array nums, remove the duplicates in-place such that each element appears only once. Return the new length.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 80 AND q.question_text = $$Given a sorted array nums, remove duplicates in-place such that each element appears at most twice. Return the new length.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 80 AND q.question_text = $$Given a sorted array nums, remove duplicates in-place such that each element appears at most twice. Return the new length.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 169 AND q.question_text = $$Given an array nums of size n, return the majority element (appears more than n/2 times). You may assume the majority element always exists.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 169 AND q.question_text = $$Given an array nums of size n, return the majority element (appears more than n/2 times). You may assume the majority element always exists.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 189 AND q.question_text = $$Given an integer array nums, rotate the array to the right by k steps.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 189 AND q.question_text = $$Given an integer array nums, rotate the array to the right by k steps.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 121 AND q.question_text = $$Given an array prices where prices[i] is the price on the ith day, find the maximum profit from one transaction (buy then sell).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 121 AND q.question_text = $$Given an array prices where prices[i] is the price on the ith day, find the maximum profit from one transaction (buy then sell).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 122 AND q.question_text = $$Given an array prices, find the maximum profit. You may buy and sell multiple times but must sell before buying again.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 122 AND q.question_text = $$Given an array prices, find the maximum profit. You may buy and sell multiple times but must sell before buying again.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 55 AND q.question_text = $$Given an integer array nums where nums[i] is the max jump length from position i, determine if you can reach the last index.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 55 AND q.question_text = $$Given an integer array nums where nums[i] is the max jump length from position i, determine if you can reach the last index.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 45 AND q.question_text = $$Given an integer array nums, return the minimum number of jumps to reach the last index. You can always reach the last index.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 45 AND q.question_text = $$Given an integer array nums, return the minimum number of jumps to reach the last index. You can always reach the last index.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 274 AND q.question_text = $$Given an array of citation counts, return the researcher's h-index (the maximum h such that h papers have at least h citations).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 274 AND q.question_text = $$Given an array of citation counts, return the researcher's h-index (the maximum h such that h papers have at least h citations).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 380 AND q.question_text = $$Implement a RandomizedSet class that supports insert, remove, and getRandom in average O(1) time.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 380 AND q.question_text = $$Implement a RandomizedSet class that supports insert, remove, and getRandom in average O(1) time.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 238 AND q.question_text = $$Given an integer array nums, return an array answer where answer[i] is the product of all elements except nums[i], without using division.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 238 AND q.question_text = $$Given an integer array nums, return an array answer where answer[i] is the product of all elements except nums[i], without using division.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 134 AND q.question_text = $$There are n gas stations in a circle. Given gas[i] and cost[i], return the starting station index for a complete circuit, or -1 if impossible.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 134 AND q.question_text = $$There are n gas stations in a circle. Given gas[i] and cost[i], return the starting station index for a complete circuit, or -1 if impossible.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 135 AND q.question_text = $$Each child has a rating. Give each child at least 1 candy. Children with higher ratings than neighbors must get more candy. Return the minimum total.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 135 AND q.question_text = $$Each child has a rating. Give each child at least 1 candy. Children with higher ratings than neighbors must get more candy. Return the minimum total.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 42 AND q.question_text = $$Given n non-negative integers representing an elevation map, compute how much water it can trap after raining.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 42 AND q.question_text = $$Given n non-negative integers representing an elevation map, compute how much water it can trap after raining.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 13 AND q.question_text = $$Given a roman numeral string, convert it to an integer.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 13 AND q.question_text = $$Given a roman numeral string, convert it to an integer.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 12 AND q.question_text = $$Given an integer, convert it to a roman numeral string.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 12 AND q.question_text = $$Given an integer, convert it to a roman numeral string.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 58 AND q.question_text = $$Given a string s consisting of words and spaces, return the length of the last word.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 58 AND q.question_text = $$Given a string s consisting of words and spaces, return the length of the last word.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 14 AND q.question_text = $$Write a function to find the longest common prefix among an array of strings.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 14 AND q.question_text = $$Write a function to find the longest common prefix among an array of strings.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 151 AND q.question_text = $$Given a string s, reverse the order of words. Words are separated by spaces; the result should have single spaces and no leading/trailing spaces.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 151 AND q.question_text = $$Given a string s, reverse the order of words. Words are separated by spaces; the result should have single spaces and no leading/trailing spaces.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 6 AND q.question_text = $$Write the string in a zigzag pattern on numRows rows, then read line by line.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 6 AND q.question_text = $$Write the string in a zigzag pattern on numRows rows, then read line by line.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 28 AND q.question_text = $$Given two strings haystack and needle, return the index of the first occurrence of needle in haystack, or -1.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 28 AND q.question_text = $$Given two strings haystack and needle, return the index of the first occurrence of needle in haystack, or -1.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 68 AND q.question_text = $$Given an array of words and a maxWidth, format the text so each line has exactly maxWidth characters, fully justified.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 68 AND q.question_text = $$Given an array of words and a maxWidth, format the text so each line has exactly maxWidth characters, fully justified.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'array' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 125 AND q.question_text = $$Given a string s, return true if it is a palindrome considering only alphanumeric characters and ignoring case.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 125 AND q.question_text = $$Given a string s, return true if it is a palindrome considering only alphanumeric characters and ignoring case.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'two-pointers' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 392 AND q.question_text = $$Given two strings s and t, return true if s is a subsequence of t.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 392 AND q.question_text = $$Given two strings s and t, return true if s is a subsequence of t.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'two-pointers' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 167 AND q.question_text = $$Given a 1-indexed sorted array, find two numbers that add up to target. Return their 1-indexed positions.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 167 AND q.question_text = $$Given a 1-indexed sorted array, find two numbers that add up to target. Return their 1-indexed positions.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'two-pointers' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 11 AND q.question_text = $$Given n vertical lines, find two that together with the x-axis form a container holding the most water.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 11 AND q.question_text = $$Given n vertical lines, find two that together with the x-axis form a container holding the most water.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'two-pointers' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 15 AND q.question_text = $$Given an integer array nums, return all unique triplets [a, b, c] such that a + b + c = 0.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 15 AND q.question_text = $$Given an integer array nums, return all unique triplets [a, b, c] such that a + b + c = 0.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'two-pointers' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 209 AND q.question_text = $$Given an array of positive integers and a target, return the minimal length of a subarray whose sum >= target, or 0.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 209 AND q.question_text = $$Given an array of positive integers and a target, return the minimal length of a subarray whose sum >= target, or 0.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'sliding-window' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 3 AND q.question_text = $$Given a string s, find the length of the longest substring without repeating characters.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 3 AND q.question_text = $$Given a string s, find the length of the longest substring without repeating characters.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'sliding-window' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 30 AND q.question_text = $$Given a string s and an array of equal-length words, find all starting indices of substrings that are a concatenation of all words in any order.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 30 AND q.question_text = $$Given a string s and an array of equal-length words, find all starting indices of substrings that are a concatenation of all words in any order.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'sliding-window' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 76 AND q.question_text = $$Given strings s and t, return the minimum window substring of s that contains all characters of t.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 76 AND q.question_text = $$Given strings s and t, return the minimum window substring of s that contains all characters of t.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'sliding-window' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 36 AND q.question_text = $$Determine if a 9x9 Sudoku board is valid. Only filled cells need to be validated.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 36 AND q.question_text = $$Determine if a 9x9 Sudoku board is valid. Only filled cells need to be validated.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'matrix' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 54 AND q.question_text = $$Given an m x n matrix, return all elements in spiral order.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 54 AND q.question_text = $$Given an m x n matrix, return all elements in spiral order.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'matrix' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 48 AND q.question_text = $$Rotate an n x n 2D matrix 90 degrees clockwise in-place.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 48 AND q.question_text = $$Rotate an n x n 2D matrix 90 degrees clockwise in-place.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'matrix' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 73 AND q.question_text = $$If an element is 0, set its entire row and column to 0. Do it in-place.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 73 AND q.question_text = $$If an element is 0, set its entire row and column to 0. Do it in-place.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'matrix' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 289 AND q.question_text = $$Implement Conway's Game of Life. Update the board in-place simultaneously.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 289 AND q.question_text = $$Implement Conway's Game of Life. Update the board in-place simultaneously.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'matrix' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 383 AND q.question_text = $$Given two strings ransomNote and magazine, return true if ransomNote can be constructed from the letters of magazine.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 383 AND q.question_text = $$Given two strings ransomNote and magazine, return true if ransomNote can be constructed from the letters of magazine.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'hashmap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 205 AND q.question_text = $$Given two strings s and t, determine if they are isomorphic (characters can be mapped one-to-one).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 205 AND q.question_text = $$Given two strings s and t, determine if they are isomorphic (characters can be mapped one-to-one).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'hashmap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 290 AND q.question_text = $$Given a pattern and a string s, determine if s follows the same pattern (bijection between letters and words).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 290 AND q.question_text = $$Given a pattern and a string s, determine if s follows the same pattern (bijection between letters and words).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'hashmap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 242 AND q.question_text = $$Given two strings s and t, return true if t is an anagram of s.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 242 AND q.question_text = $$Given two strings s and t, return true if t is an anagram of s.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'hashmap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 49 AND q.question_text = $$Given an array of strings, group the anagrams together.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 49 AND q.question_text = $$Given an array of strings, group the anagrams together.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'hashmap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1 AND q.question_text = $$Given an array of integers and a target, return the indices of the two numbers that add up to target.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 1 AND q.question_text = $$Given an array of integers and a target, return the indices of the two numbers that add up to target.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'hashmap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 202 AND q.question_text = $$Determine if a number is "happy": repeatedly replace it with the sum of the squares of its digits until it equals 1 or loops forever.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 202 AND q.question_text = $$Determine if a number is "happy": repeatedly replace it with the sum of the squares of its digits until it equals 1 or loops forever.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'hashmap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 219 AND q.question_text = $$Given an array nums and integer k, return true if there are two distinct indices i and j such that nums[i] == nums[j] and abs(i - j) <= k.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 219 AND q.question_text = $$Given an array nums and integer k, return true if there are two distinct indices i and j such that nums[i] == nums[j] and abs(i - j) <= k.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'hashmap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 128 AND q.question_text = $$Given an unsorted array of integers, find the length of the longest consecutive elements sequence in O(n) time.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 128 AND q.question_text = $$Given an unsorted array of integers, find the length of the longest consecutive elements sequence in O(n) time.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'hashmap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 228 AND q.question_text = $$Given a sorted unique integer array, return the smallest sorted list of ranges that cover all the numbers.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 228 AND q.question_text = $$Given a sorted unique integer array, return the smallest sorted list of ranges that cover all the numbers.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'intervals' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 56 AND q.question_text = $$Given an array of intervals, merge all overlapping intervals.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 56 AND q.question_text = $$Given an array of intervals, merge all overlapping intervals.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'intervals' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 57 AND q.question_text = $$Insert a new interval into a sorted non-overlapping list of intervals, merging if necessary.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 57 AND q.question_text = $$Insert a new interval into a sorted non-overlapping list of intervals, merging if necessary.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'intervals' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 452 AND q.question_text = $$Given balloons as intervals on the x-axis, find the minimum number of arrows (vertical lines) to burst all balloons.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 452 AND q.question_text = $$Given balloons as intervals on the x-axis, find the minimum number of arrows (vertical lines) to burst all balloons.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'intervals' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 71 AND q.question_text = $$Given an absolute Unix file path, simplify it to its canonical form.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 71 AND q.question_text = $$Given an absolute Unix file path, simplify it to its canonical form.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 150 AND q.question_text = $$Evaluate an arithmetic expression in Reverse Polish Notation (postfix).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 150 AND q.question_text = $$Evaluate an arithmetic expression in Reverse Polish Notation (postfix).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 224 AND q.question_text = $$Implement a basic calculator to evaluate a string expression with +, -, and parentheses.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 224 AND q.question_text = $$Implement a basic calculator to evaluate a string expression with +, -, and parentheses.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'stack' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 141 AND q.question_text = $$Given head of a linked list, determine if the list has a cycle.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 141 AND q.question_text = $$Given head of a linked list, determine if the list has a cycle.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 2 AND q.question_text = $$Two non-empty linked lists represent non-negative integers in reverse order. Return their sum as a linked list.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 2 AND q.question_text = $$Two non-empty linked lists represent non-negative integers in reverse order. Return their sum as a linked list.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 21 AND q.question_text = $$Merge two sorted linked lists into one sorted list.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 21 AND q.question_text = $$Merge two sorted linked lists into one sorted list.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 138 AND q.question_text = $$Deep copy a linked list where each node has a next pointer and a random pointer.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 138 AND q.question_text = $$Deep copy a linked list where each node has a next pointer and a random pointer.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 92 AND q.question_text = $$Reverse the nodes of a linked list from position left to position right.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 92 AND q.question_text = $$Reverse the nodes of a linked list from position left to position right.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 25 AND q.question_text = $$Reverse every k consecutive nodes in a linked list. If remaining nodes < k, leave them as is.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 25 AND q.question_text = $$Reverse every k consecutive nodes in a linked list. If remaining nodes < k, leave them as is.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 19 AND q.question_text = $$Remove the nth node from the end of a linked list and return the head.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 19 AND q.question_text = $$Remove the nth node from the end of a linked list and return the head.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 82 AND q.question_text = $$Given the head of a sorted linked list, delete all nodes with duplicate numbers, leaving only distinct values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 82 AND q.question_text = $$Given the head of a sorted linked list, delete all nodes with duplicate numbers, leaving only distinct values.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 61 AND q.question_text = $$Given a linked list, rotate the list to the right by k places.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 61 AND q.question_text = $$Given a linked list, rotate the list to the right by k places.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 86 AND q.question_text = $$Given a linked list and a value x, partition it so all nodes < x come before nodes >= x, preserving order.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 86 AND q.question_text = $$Given a linked list and a value x, partition it so all nodes < x come before nodes >= x, preserving order.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 146 AND q.question_text = $$Design a data structure for a Least Recently Used (LRU) cache with get and put in O(1).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 146 AND q.question_text = $$Design a data structure for a Least Recently Used (LRU) cache with get and put in O(1).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'linked-list' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 105 AND q.question_text = $$Given preorder and inorder traversal arrays, construct the binary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 105 AND q.question_text = $$Given preorder and inorder traversal arrays, construct the binary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 106 AND q.question_text = $$Given inorder and postorder traversal arrays, construct the binary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 106 AND q.question_text = $$Given inorder and postorder traversal arrays, construct the binary tree.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 117 AND q.question_text = $$Populate each node's next pointer to point to its next right node. If there is no next right node, set it to NULL.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 117 AND q.question_text = $$Populate each node's next pointer to point to its next right node. If there is no next right node, set it to NULL.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 114 AND q.question_text = $$Flatten a binary tree to a linked list in-place using preorder traversal.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 114 AND q.question_text = $$Flatten a binary tree to a linked list in-place using preorder traversal.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 129 AND q.question_text = $$Each root-to-leaf path represents a number. Return the total sum of all root-to-leaf numbers.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 129 AND q.question_text = $$Each root-to-leaf path represents a number. Return the total sum of all root-to-leaf numbers.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 124 AND q.question_text = $$Find the maximum path sum in a binary tree. A path can start and end at any node.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 124 AND q.question_text = $$Find the maximum path sum in a binary tree. A path can start and end at any node.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 173 AND q.question_text = $$Implement an iterator over a BST with next() and hasNext() in O(h) space.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 173 AND q.question_text = $$Implement an iterator over a BST with next() and hasNext() in O(h) space.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 222 AND q.question_text = $$Count the number of nodes in a complete binary tree in less than O(n) time.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 222 AND q.question_text = $$Count the number of nodes in a complete binary tree in less than O(n) time.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 236 AND q.question_text = $$Given a binary tree, find the lowest common ancestor (LCA) of two given nodes.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 236 AND q.question_text = $$Given a binary tree, find the lowest common ancestor (LCA) of two given nodes.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-tree' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 199 AND q.question_text = $$Given the root of a binary tree, return the values of nodes visible from the right side.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 199 AND q.question_text = $$Given the root of a binary tree, return the values of nodes visible from the right side.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 637 AND q.question_text = $$Given the root of a binary tree, return the average value of nodes on each level.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 637 AND q.question_text = $$Given the root of a binary tree, return the average value of nodes on each level.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 102 AND q.question_text = $$Given the root of a binary tree, return the level order traversal as a list of lists.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 102 AND q.question_text = $$Given the root of a binary tree, return the level order traversal as a list of lists.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 103 AND q.question_text = $$Return the zigzag level order traversal of a binary tree (alternating left-to-right and right-to-left).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 103 AND q.question_text = $$Return the zigzag level order traversal of a binary tree (alternating left-to-right and right-to-left).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 230 AND q.question_text = $$Given the root of a BST, return the kth smallest value.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 230 AND q.question_text = $$Given the root of a BST, return the kth smallest value.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bst' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 98 AND q.question_text = $$Determine if a binary tree is a valid BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 98 AND q.question_text = $$Determine if a binary tree is a valid BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bst' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 200 AND q.question_text = $$Given a 2D grid of "1"s (land) and "0"s (water), count the number of islands.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 200 AND q.question_text = $$Given a 2D grid of "1"s (land) and "0"s (water), count the number of islands.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'graph' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 130 AND q.question_text = $$Capture all "O" regions that are fully surrounded by "X" by flipping them to "X".$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 130 AND q.question_text = $$Capture all "O" regions that are fully surrounded by "X" by flipping them to "X".$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'graph' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 133 AND q.question_text = $$Given a reference of a node in a connected undirected graph, return a deep copy.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 133 AND q.question_text = $$Given a reference of a node in a connected undirected graph, return a deep copy.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'graph' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 399 AND q.question_text = $$Given equations a/b=k, answer queries a/c by traversing the graph of ratios.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 399 AND q.question_text = $$Given equations a/b=k, answer queries a/c by traversing the graph of ratios.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'graph' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 207 AND q.question_text = $$There are numCourses courses with prerequisites. Determine if you can finish all courses (no cycles).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 207 AND q.question_text = $$There are numCourses courses with prerequisites. Determine if you can finish all courses (no cycles).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'graph' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 210 AND q.question_text = $$Return the ordering of courses you should take to finish all courses, or an empty array if impossible.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 210 AND q.question_text = $$Return the ordering of courses you should take to finish all courses, or an empty array if impossible.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'graph' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 909 AND q.question_text = $$Return the minimum number of dice rolls to reach the last square on a Snakes and Ladders board.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 909 AND q.question_text = $$Return the minimum number of dice rolls to reach the last square on a Snakes and Ladders board.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'graph-bfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 433 AND q.question_text = $$Find the minimum number of mutations to go from startGene to endGene. Each mutation changes one char and must be in the bank.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 433 AND q.question_text = $$Find the minimum number of mutations to go from startGene to endGene. Each mutation changes one char and must be in the bank.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'graph-bfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 127 AND q.question_text = $$Given beginWord, endWord, and a wordList, find the length of the shortest transformation sequence (each step changes one letter).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 127 AND q.question_text = $$Given beginWord, endWord, and a wordList, find the length of the shortest transformation sequence (each step changes one letter).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'graph-bfs' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 208 AND q.question_text = $$Implement a Trie with insert, search, and startsWith methods.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 208 AND q.question_text = $$Implement a Trie with insert, search, and startsWith methods.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'trie' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 211 AND q.question_text = $$Design a data structure supporting addWord and search where "." matches any letter.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 211 AND q.question_text = $$Design a data structure supporting addWord and search where "." matches any letter.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'trie' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 212 AND q.question_text = $$Given a 2D board and a list of words, return all words that can be formed by sequentially adjacent cells.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 212 AND q.question_text = $$Given a 2D board and a list of words, return all words that can be formed by sequentially adjacent cells.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'trie' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 17 AND q.question_text = $$Given a string of digits 2-9, return all possible letter combinations (phone keypad mapping).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 17 AND q.question_text = $$Given a string of digits 2-9, return all possible letter combinations (phone keypad mapping).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'backtracking' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 77 AND q.question_text = $$Given two integers n and k, return all possible combinations of k numbers from [1, n].$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 77 AND q.question_text = $$Given two integers n and k, return all possible combinations of k numbers from [1, n].$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'backtracking' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 46 AND q.question_text = $$Given an array of distinct integers, return all possible permutations.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 46 AND q.question_text = $$Given an array of distinct integers, return all possible permutations.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'backtracking' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 39 AND q.question_text = $$Given an array of distinct integers and a target, return all unique combinations that sum to target. Numbers may be reused.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 39 AND q.question_text = $$Given an array of distinct integers and a target, return all unique combinations that sum to target. Numbers may be reused.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'backtracking' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 52 AND q.question_text = $$Return the number of distinct solutions to the n-queens puzzle.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 52 AND q.question_text = $$Return the number of distinct solutions to the n-queens puzzle.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'backtracking' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 22 AND q.question_text = $$Given n pairs of parentheses, generate all valid combinations.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 22 AND q.question_text = $$Given n pairs of parentheses, generate all valid combinations.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'backtracking' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 79 AND q.question_text = $$Given a 2D board and a word, determine if the word exists in the grid by moving to adjacent cells.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 79 AND q.question_text = $$Given a 2D board and a word, determine if the word exists in the grid by moving to adjacent cells.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'backtracking' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 108 AND q.question_text = $$Given a sorted array, convert it to a height-balanced BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 108 AND q.question_text = $$Given a sorted array, convert it to a height-balanced BST.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'divide-conquer' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 148 AND q.question_text = $$Sort a linked list in O(n log n) time and O(1) space.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 148 AND q.question_text = $$Sort a linked list in O(n log n) time and O(1) space.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'divide-conquer' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 427 AND q.question_text = $$Given an n x n grid of 0s and 1s, construct a Quad-Tree representation.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 427 AND q.question_text = $$Given an n x n grid of 0s and 1s, construct a Quad-Tree representation.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'divide-conquer' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 23 AND q.question_text = $$Merge k sorted linked lists into one sorted linked list.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 23 AND q.question_text = $$Merge k sorted linked lists into one sorted linked list.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'divide-conquer' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 53 AND q.question_text = $$Find the contiguous subarray with the largest sum.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 53 AND q.question_text = $$Find the contiguous subarray with the largest sum.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'kadane' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 918 AND q.question_text = $$Given a circular integer array, find the maximum possible subarray sum.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 918 AND q.question_text = $$Given a circular integer array, find the maximum possible subarray sum.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'kadane' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 35 AND q.question_text = $$Given a sorted array and a target, return the index where it would be inserted.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 35 AND q.question_text = $$Given a sorted array and a target, return the index where it would be inserted.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-search' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 74 AND q.question_text = $$Search for a target in a sorted m x n matrix where each row follows the previous row's last element.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 74 AND q.question_text = $$Search for a target in a sorted m x n matrix where each row follows the previous row's last element.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-search' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 162 AND q.question_text = $$Find a peak element in an array (strictly greater than neighbors) and return its index.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 162 AND q.question_text = $$Find a peak element in an array (strictly greater than neighbors) and return its index.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-search' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 33 AND q.question_text = $$Search for a target in a rotated sorted array. Return its index or -1.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 33 AND q.question_text = $$Search for a target in a rotated sorted array. Return its index or -1.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-search' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 34 AND q.question_text = $$Find the starting and ending position of a given target in a sorted array.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 34 AND q.question_text = $$Find the starting and ending position of a given target in a sorted array.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-search' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 153 AND q.question_text = $$Find the minimum element in a rotated sorted array (no duplicates).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 153 AND q.question_text = $$Find the minimum element in a rotated sorted array (no duplicates).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-search' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 4 AND q.question_text = $$Given two sorted arrays, return the median of the combined array in O(log(m+n)).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 4 AND q.question_text = $$Given two sorted arrays, return the median of the combined array in O(log(m+n)).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'binary-search' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 215 AND q.question_text = $$Find the kth largest element in an unsorted array.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 215 AND q.question_text = $$Find the kth largest element in an unsorted array.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'heap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 502 AND q.question_text = $$Maximize capital after completing at most k projects. Each project has a profit and minimum capital requirement.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 502 AND q.question_text = $$Maximize capital after completing at most k projects. Each project has a profit and minimum capital requirement.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'heap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 373 AND q.question_text = $$Given two sorted arrays, find k pairs (u, v) with the smallest sums.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 373 AND q.question_text = $$Given two sorted arrays, find k pairs (u, v) with the smallest sums.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'heap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 295 AND q.question_text = $$Design a data structure that supports addNum and findMedian for a stream of integers.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 295 AND q.question_text = $$Design a data structure that supports addNum and findMedian for a stream of integers.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'heap' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 67 AND q.question_text = $$Given two binary strings, return their sum as a binary string.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 67 AND q.question_text = $$Given two binary strings, return their sum as a binary string.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bit' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 190 AND q.question_text = $$Reverse the bits of a given 32-bit unsigned integer.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 190 AND q.question_text = $$Reverse the bits of a given 32-bit unsigned integer.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bit' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 191 AND q.question_text = $$Return the number of 1 bits in the binary representation of an unsigned integer.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 191 AND q.question_text = $$Return the number of 1 bits in the binary representation of an unsigned integer.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bit' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 136 AND q.question_text = $$Every element appears twice except one. Find the single element.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 136 AND q.question_text = $$Every element appears twice except one. Find the single element.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bit' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 137 AND q.question_text = $$Every element appears three times except one. Find the single element.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 137 AND q.question_text = $$Every element appears three times except one. Find the single element.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bit' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 201 AND q.question_text = $$Given a range [left, right], return the bitwise AND of all numbers in the range.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 201 AND q.question_text = $$Given a range [left, right], return the bitwise AND of all numbers in the range.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'bit' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 9 AND q.question_text = $$Determine whether an integer is a palindrome without converting to string.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 9 AND q.question_text = $$Determine whether an integer is a palindrome without converting to string.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'math' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 66 AND q.question_text = $$Given a large integer as an array of digits, add one to it.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 66 AND q.question_text = $$Given a large integer as an array of digits, add one to it.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'math' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 172 AND q.question_text = $$Given an integer n, return the number of trailing zeroes in n!.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 172 AND q.question_text = $$Given an integer n, return the number of trailing zeroes in n!.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'math' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 69 AND q.question_text = $$Compute the integer square root of x (truncated).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 69 AND q.question_text = $$Compute the integer square root of x (truncated).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'math' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 50 AND q.question_text = $$Implement pow(x, n) computing x raised to the power n.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 50 AND q.question_text = $$Implement pow(x, n) computing x raised to the power n.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'math' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 149 AND q.question_text = $$Given n points on a 2D plane, find the maximum number of points on the same straight line.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 149 AND q.question_text = $$Given n points on a 2D plane, find the maximum number of points on the same straight line.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'math' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 70 AND q.question_text = $$You can climb 1 or 2 steps. How many distinct ways can you climb to the top (n steps)?$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 70 AND q.question_text = $$You can climb 1 or 2 steps. How many distinct ways can you climb to the top (n steps)?$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 198 AND q.question_text = $$Given an array of house values, find the maximum money you can rob without robbing two adjacent houses.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 198 AND q.question_text = $$Given an array of house values, find the maximum money you can rob without robbing two adjacent houses.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 139 AND q.question_text = $$Given a string s and a dictionary wordDict, return true if s can be segmented into dictionary words.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 139 AND q.question_text = $$Given a string s and a dictionary wordDict, return true if s can be segmented into dictionary words.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 322 AND q.question_text = $$Given coin denominations and an amount, return the fewest coins needed to make the amount, or -1.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 322 AND q.question_text = $$Given coin denominations and an amount, return the fewest coins needed to make the amount, or -1.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 300 AND q.question_text = $$Given an integer array, return the length of the longest strictly increasing subsequence.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 300 AND q.question_text = $$Given an integer array, return the length of the longest strictly increasing subsequence.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 120 AND q.question_text = $$Given a triangle array, find the minimum path sum from top to bottom (moving to adjacent numbers on the row below).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 120 AND q.question_text = $$Given a triangle array, find the minimum path sum from top to bottom (moving to adjacent numbers on the row below).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 64 AND q.question_text = $$Given an m x n grid of non-negative numbers, find a path from top-left to bottom-right that minimizes the sum.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 64 AND q.question_text = $$Given an m x n grid of non-negative numbers, find a path from top-left to bottom-right that minimizes the sum.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 63 AND q.question_text = $$A robot on an m x n grid with obstacles can move right or down. How many unique paths exist from top-left to bottom-right?$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 63 AND q.question_text = $$A robot on an m x n grid with obstacles can move right or down. How many unique paths exist from top-left to bottom-right?$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 5 AND q.question_text = $$Given a string s, return the longest palindromic substring.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 5 AND q.question_text = $$Given a string s, return the longest palindromic substring.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 97 AND q.question_text = $$Given strings s1, s2, and s3, determine if s3 is formed by interleaving s1 and s2.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 97 AND q.question_text = $$Given strings s1, s2, and s3, determine if s3 is formed by interleaving s1 and s2.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 72 AND q.question_text = $$Given two strings word1 and word2, return the minimum edit distance (insert, delete, replace).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 72 AND q.question_text = $$Given two strings word1 and word2, return the minimum edit distance (insert, delete, replace).$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 123 AND q.question_text = $$Find the maximum profit with at most two transactions.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 123 AND q.question_text = $$Find the maximum profit with at most two transactions.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 188 AND q.question_text = $$Find the maximum profit with at most k transactions.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 188 AND q.question_text = $$Find the maximum profit with at most k transactions.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 221 AND q.question_text = $$Find the largest square containing only 1s in a binary matrix and return its area.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'top150' LIMIT 1), CURRENT_TIMESTAMP),
((SELECT q.id FROM questions q WHERE q.mode = 'typing-race' AND q.leetcode_number = 221 AND q.question_text = $$Find the largest square containing only 1s in a binary matrix and return its area.$$ ORDER BY q.id DESC LIMIT 1), (SELECT t.id FROM topics t WHERE t.name = 'dp' LIMIT 1), CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

COMMIT;
