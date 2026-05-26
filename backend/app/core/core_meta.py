from __future__ import annotations

import heapq
import random
from collections import Counter, OrderedDict, deque


class GraphNode:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []


def clone_graph(node: GraphNode) -> GraphNode:
    if not node:
        return node

    q = deque([node])
    clones = {node.val: GraphNode(node.val, [])}
    while q:
        cur = q.popleft()
        cur_clone = clones[cur.val]

        for ngbr in cur.neighbors:
            if ngbr.val not in clones:
                clones[ngbr.val] = GraphNode(ngbr.val, [])
                q.append(ngbr)

            cur_clone.neighbors.append(clones[ngbr.val])

    return clones[node.val]


def nested_list_weight_sum(nested_list):
    q = deque(nested_list)
    depth = 1
    total = 0
    while q:
        for _ in range(len(q)):
            nested = q.pop()
            if nested.isInteger():
                total += nested.getInteger() * depth
            else:
                q.extendleft(nested.getList())
        depth += 1
    return total


class ValidWordAbbr:
    def __init__(self, dictionary):
        self.abbr_dict = {}

        for word in dictionary:
            abbr = self.to_abbr(word)
            if abbr not in self.abbr_dict:
                self.abbr_dict[abbr] = set()
            self.abbr_dict[abbr].add(word)

    def is_unique(self, word):
        abbr = self.to_abbr(word)
        words = self.abbr_dict.get(abbr, set())
        return not words or (len(words) == 1 and word in words)

    def to_abbr(self, s):
        if len(s) <= 2:
            return s
        return s[0] + str(len(s) - 2) + s[-1]


def dest_city(paths):
    has_outgoing = set()
    for start, _ in paths:
        has_outgoing.add(start)

    for _, candidate in paths:
        if candidate not in has_outgoing:
            return candidate

    return ""


class ParentTreeNode:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None
        self.parent = None


class ParentPointerLCA:
    def get_depth(self, p):
        depth = 0
        while p:
            p = p.parent
            depth += 1
        return depth

    def lowest_common_ancestor(self, p: ParentTreeNode, q: ParentTreeNode):
        p_depth = self.get_depth(p)
        q_depth = self.get_depth(q)

        for _ in range(p_depth - q_depth):
            p = p.parent
        for _ in range(q_depth - p_depth):
            q = q.parent

        while p != q:
            p = p.parent
            q = q.parent
        return p


class NextPermutation:
    def next_permutation(self, nums):
        pivot_index = len(nums) - 2
        while pivot_index >= 0 and nums[pivot_index] >= nums[pivot_index + 1]:
            pivot_index -= 1

        if pivot_index >= 0:
            next_larger_index = len(nums) - 1
            while nums[next_larger_index] <= nums[pivot_index]:
                next_larger_index -= 1
            self.swap(nums, pivot_index, next_larger_index)

        self.reverse(nums, pivot_index + 1)
        return nums

    def reverse(self, nums, start_index):
        left, right = start_index, len(nums) - 1
        while left < right:
            self.swap(nums, left, right)
            left += 1
            right -= 1

    def swap(self, nums, index1, index2):
        nums[index1], nums[index2] = nums[index2], nums[index1]


class NextPermutationSwapBug:
    def next_permutation(self, nums):
        pivot_index = len(nums) - 2
        while pivot_index >= 0 and nums[pivot_index] >= nums[pivot_index + 1]:
            pivot_index -= 1

        if pivot_index >= 0:
            next_larger_index = len(nums) - 1
            while nums[next_larger_index] <= nums[pivot_index]:
                next_larger_index -= 1
            self.swap(nums, pivot_index, next_larger_index)

        self.reverse(nums, pivot_index + 1)
        return nums

    def reverse(self, nums, start_idx):
        left, right = start_idx, len(nums) - 1
        while left < right:
            self.swap(nums, left, right)
            left += 1
            right -= 1

    def swap(self, nums, idx1, idx2):
        nums[idx1], nums[idx2] = nums[idx1], nums[idx2]


class NextPermutationReverseBug:
    def next_permutation(self, nums):
        pivot_index = len(nums) - 2
        while pivot_index >= 0 and nums[pivot_index] >= nums[pivot_index + 1]:
            pivot_index -= 1

        if pivot_index >= 0:
            next_larger_index = len(nums) - 1
            while nums[next_larger_index] <= nums[pivot_index]:
                next_larger_index -= 1
            self.swap(nums, pivot_index, next_larger_index)
        self.reverse(nums, pivot_index + 1)
        return nums

    def reverse(self, nums, start_idx):
        left, right = start_idx, len(nums) - 1
        while left < right:
            left += 1
            right -= 1

    def swap(self, nums, idx1, idx2):
        nums[idx1], nums[idx2] = nums[idx2], nums[idx2]


class NextPermutationPartialBug:
    def next_permutation(self, nums):
        pivot_index = len(nums) - 2
        while pivot_index >= 0 and nums[pivot_index] >= nums[pivot_index + 1]:
            pivot_index -= 1

        if pivot_index >= 0:
            next_larger_index = len(nums) - 1
            while nums[next_larger_index] <= nums[pivot_index]:
                next_larger_index -= 1
            self.swap(nums, pivot_index, next_larger_index)
        self.reverse(nums, pivot_index + 1)
        return nums

    def reverse(self, nums, start_idx):
        left, right = start_idx, len(nums) - 1
        while left < right:
            left += 1
            right -= 1

    def swap(self, nums, idx1, idx2):
        nums[idx1], nums[idx2] = nums[idx2], nums[idx1]


def kth_largest_heap(nums, k):
    heap = []
    for num in nums:
        heapq.heappush(heap, num)
        if len(heap) > k:
            heapq.heappop(heap)
    return heap[0]


def kth_largest_quick_select(nums, k):
    pivot = random.choice(nums)
    left, mid, right = [], [], []

    for num in nums:
        if num > pivot:
            left.append(num)
        elif num < pivot:
            right.append(num)
        else:
            mid.append(num)

    if k <= len(left):
        return kth_largest_quick_select(left, k)

    if len(left) + len(mid) < k:
        return kth_largest_quick_select(right, k - len(left) - len(mid))

    return pivot


class MovingAverage:
    def __init__(self, size: int):
        self.size = size
        self.queue = []

    def next(self, val: int) -> float:
        size, queue = self.size, self.queue
        queue.append(val)
        window_sum = sum(queue[-size:])
        return window_sum / min(len(queue), size)


def top_k_frequent(nums, k):
    if k == len(nums):
        return nums

    count = Counter(nums)
    return heapq.nlargest(k, count.keys(), key=count.get)


class TopKFrequentQuickSelect:
    def topKFrequent(self, nums, k):
        count = Counter(nums)
        unique = list(count.keys())

        def partition(left, right, pivot_index) -> int:
            pivot_frequency = count[unique[pivot_index]]
            unique[pivot_index], unique[right] = unique[right], unique[pivot_index]

            store_index = left
            for i in range(left, right):
                if count[unique[i]] < pivot_frequency:
                    unique[store_index], unique[i] = unique[i], unique[store_index]
                    store_index += 1

            unique[right], unique[store_index] = unique[store_index], unique[right]

            return store_index

        def quickselect(left, right, k_smallest) -> None:
            if left == right:
                return

            pivot_index = random.randint(left, right)
            pivot_index = partition(left, right, pivot_index)

            if k_smallest == pivot_index:
                return
            if k_smallest < pivot_index:
                quickselect(left, pivot_index - 1, k_smallest)
            else:
                quickselect(pivot_index + 1, right, k_smallest)

        n = len(unique)
        quickselect(0, n - 1, n - k)

        return unique[n - k:]


def merge_intervals(intervals):
    intervals.sort(key=lambda x: x[0])
    merged = []
    for interval in intervals:
        if not merged or merged[-1][1] < interval[0]:
            merged.append(interval)
        else:
            merged[-1][1] = max(merged[-1][1], interval[1])
    return merged


merge = merge_intervals


def valid_parentheses(s):
    stack = []
    mapping = {")": "(", "}": "{", "]": "["}
    for char in s:
        if char in mapping:
            top_element = stack.pop() if stack else "#"
            if mapping[char] != top_element:
                return False
        else:
            stack.append(char)
    return not stack


def custom_sort_string(order, s):
    sorted_s = sorted(s, key=lambda c: order.index(c) if c in order else float("inf"))
    return "".join(sorted_s)


custom = custom_sort_string


def simplify_path(path):
    stack = []
    for portion in path.split("/"):
        if portion == "..":
            if stack:
                stack.pop()
        elif portion == "." or not portion:
            continue
        else:
            stack.append(portion)
    return "/" + "/".join(stack)


simplify = simplify_path


class TreeNode:
    def __init__(self, x):
        self.val = x
        self.left = None
        self.right = None


def vertical_order_traversal(root):
    node_list = []

    def bfs(root):
        queue = deque([(root, 0, 0)])
        while queue:
            node, row, column = queue.popleft()
            if node is not None:
                node_list.append((column, row, node.val))
                queue.append((node.left, row + 1, column - 1))
                queue.append((node.right, row + 1, column + 1))

    bfs(root)
    node_list.sort()
    ret = OrderedDict()
    for column, _, value in node_list:
        if column in ret:
            ret[column].append(value)
        else:
            ret[column] = [value]

    return ret.values()


vertical_traversal = vertical_order_traversal


def valid_palindrome(s):
    left = 0
    right = len(s) - 1
    while left < right:
        while left < right and not s[left].isalnum():
            left += 1
        while left < right and not s[right].isalnum():
            right -= 1
        if s[left].lower() != s[right].lower():
            return False
        left += 1
        right -= 1
    return True


def range_sum_bst(root, low, high):
    ans = []

    def dfs(root):
        if not root:
            return
        if low <= root.val <= high:
            ans.append(root.val)
        dfs(root.left)
        dfs(root.right)

    dfs(root)
    return sum(ans)


range_sum = range_sum_bst


class StockPrice:
    def __init__(self):
        self.latest_time = 0
        self.timestamp_price_map = {}
        self.price_frequency = Counter()

    def update(self, timestamp: int, price: int) -> None:
        self.latest_time = max(self.latest_time, timestamp)
        if timestamp in self.timestamp_price_map:
            old_price = self.timestamp_price_map[timestamp]
            self.price_frequency[old_price] -= 1
            if self.price_frequency[old_price] == 0:
                del self.price_frequency[old_price]

        self.timestamp_price_map[timestamp] = price
        self.price_frequency[price] += 1

    def current(self) -> int:
        return self.timestamp_price_map[self.latest_time]

    def maximum(self) -> int:
        return max(self.price_frequency)

    def minimum(self) -> int:
        return min(self.price_frequency)


def unique_paths_dp(m, n):
    grid = [[1] * n for _ in range(m)]

    for c in range(1, m):
        for r in range(1, n):
            grid[c][r] = grid[c - 1][r] + grid[c][r - 1]

    return grid[m - 1][n - 1]


unique_paths = unique_paths_dp


class BSTNode:
    def __init__(self, x):
        self.val = x
        self.left = None
        self.right = None


def lowest_common_ancestor_bst(root: BSTNode, p: BSTNode, q: BSTNode):
    if p.val > root.val and q.val > root.val:
        return lowest_common_ancestor_bst(root.right, p, q)
    if p.val < root.val and q.val < root.val:
        return lowest_common_ancestor_bst(root.left, p, q)
    return root


lca = lowest_common_ancestor_bst
