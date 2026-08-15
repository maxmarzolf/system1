from collections import Counter, defaultdict, deque
from heapq import heappop, heappush


def fixed_window_sum(nums, k):
    window = sum(nums[:k])
    out = [window]
    for right in range(k, len(nums)):
        window += nums[right] - nums[right - k]
        out.append(window)
    return out


def max_fixed_window_sum(nums, k):
    window = sum(nums[:k])
    best = window
    for right in range(k, len(nums)):
        window += nums[right] - nums[right - k]
        best = max(best, window)
    return best


def min_subarray_len_at_least(nums, target):
    left, total, best = 0, 0, len(nums) + 1
    for right, val in enumerate(nums):
        total += val
        while total >= target:
            best = min(best, right - left + 1)
            total -= nums[left]
            left += 1
    return 0 if best > len(nums) else best


def longest_window_at_most_k_distinct(items, k):
    left, counts, best = 0, defaultdict(int), 0
    for right, item in enumerate(items):
        counts[item] += 1
        while len(counts) > k:
            counts[items[left]] -= 1
            if counts[items[left]] == 0:
                del counts[items[left]]
            left += 1
        best = max(best, right - left + 1)
    return best


def permutation_window_match(text, pattern):
    need = Counter(pattern)
    window = Counter(text[: len(pattern)])
    for right in range(len(pattern), len(text) + 1):
        if window == need:
            return True
        if right == len(text):
            break
        left = right - len(pattern)
        window[text[right]] += 1
        window[text[left]] -= 1
        if window[text[left]] == 0:
            del window[text[left]]
    return False


def two_sum_sorted(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        total = nums[left] + nums[right]
        if total == target:
            return [left, right]
        if total < target:
            left += 1
        else:
            right -= 1
    return []


def remove_duplicates_sorted(nums):
    write = 0
    for read, val in enumerate(nums):
        if read == 0 or val != nums[read - 1]:
            nums[write] = val
            write += 1
    return write


def partition_by_pivot(nums, pivot):
    write = 0
    for read, val in enumerate(nums):
        if val < pivot:
            nums[write], nums[read] = nums[read], nums[write]
            write += 1
    return write


def valid_palindrome(text):
    left, right = 0, len(text) - 1
    while left < right:
        if text[left] != text[right]:
            return False
        left += 1
        right -= 1
    return True


def valid_palindrome_one_delete(text):
    def is_pal(left, right):
        while left < right:
            if text[left] != text[right]:
                return False
            left += 1
            right -= 1
        return True

    left, right = 0, len(text) - 1
    while left < right:
        if text[left] != text[right]:
            return is_pal(left + 1, right) or is_pal(left, right - 1)
        left += 1
        right -= 1
    return True


def binary_search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1


def lower_bound(nums, target):
    left, right = 0, len(nums)
    while left < right:
        mid = left + (right - left) // 2
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid
    return left


def upper_bound(nums, target):
    left, right = 0, len(nums)
    while left < right:
        mid = left + (right - left) // 2
        if nums[mid] <= target:
            left = mid + 1
        else:
            right = mid
    return left


def search_rotated(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        if nums[left] <= nums[mid]:
            if nums[left] <= target < nums[mid]:
                right = mid - 1
            else:
                left = mid + 1
        elif nums[mid] < target <= nums[right]:
            left = mid + 1
        else:
            right = mid - 1
    return -1


def binary_search_answer(left, right, can_take):
    while left < right:
        mid = left + (right - left) // 2
        if can_take(mid):
            right = mid
        else:
            left = mid + 1
    return left


def preorder_recursive(root):
    if not root:
        return []
    return [root.val] + preorder_recursive(root.left) + preorder_recursive(root.right)


def inorder_iterative(root):
    stack, out = [], []
    while stack or root:
        while root:
            stack.append(root)
            root = root.left
        root = stack.pop()
        out.append(root.val)
        root = root.right
    return out


def postorder_recursive(root):
    if not root:
        return []
    return postorder_recursive(root.left) + postorder_recursive(root.right) + [root.val]


def max_tree_depth(root):
    if not root:
        return 0
    return 1 + max(max_tree_depth(root.left), max_tree_depth(root.right))


def tree_has_path_sum(root, target):
    if not root:
        return False
    if not root.left and not root.right:
        return root.val == target
    return tree_has_path_sum(root.left, target - root.val) or tree_has_path_sum(root.right, target - root.val)


def lowest_common_ancestor(root, p, q):
    if not root or root is p or root is q:
        return root
    left = lowest_common_ancestor(root.left, p, q)
    right = lowest_common_ancestor(root.right, p, q)
    if left and right:
        return root
    return left or right


def bst_range_sum(root, low, high):
    if not root:
        return 0
    if root.val < low:
        return bst_range_sum(root.right, low, high)
    if root.val > high:
        return bst_range_sum(root.left, low, high)
    return root.val + bst_range_sum(root.left, low, high) + bst_range_sum(root.right, low, high)


def dfs_iterative(graph, start):
    seen, stack, order = {start}, [start], []
    while stack:
        node = stack.pop()
        order.append(node)
        for nxt in graph.get(node, []):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return order


def bfs_order(graph, start):
    seen, q, order = {start}, deque([start]), []
    while q:
        node = q.popleft()
        order.append(node)
        for nxt in graph.get(node, []):
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)
    return order


def bfs_levels_graph(graph, start):
    seen, q, levels = {start}, deque([start]), []
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node)
            for nxt in graph.get(node, []):
                if nxt not in seen:
                    seen.add(nxt)
                    q.append(nxt)
        levels.append(level)
    return levels


def shortest_path_unweighted(graph, start, target):
    seen, q = {start}, deque([(start, 0)])
    while q:
        node, dist = q.popleft()
        if node == target:
            return dist
        for nxt in graph.get(node, []):
            if nxt not in seen:
                seen.add(nxt)
                q.append((nxt, dist + 1))
    return -1


def count_graph_components(graph):
    seen, count = set(), 0
    for start in graph:
        if start in seen:
            continue
        count += 1
        seen.update(dfs_iterative(graph, start))
    return count


def subsets(items):
    path, out = [], []

    def dfs(i):
        if i == len(items):
            out.append(path[:])
            return
        dfs(i + 1)
        path.append(items[i])
        dfs(i + 1)
        path.pop()

    dfs(0)
    return out


def combinations(items, k):
    path, out = [], []

    def dfs(start):
        if len(path) == k:
            out.append(path[:])
            return
        for i in range(start, len(items)):
            path.append(items[i])
            dfs(i + 1)
            path.pop()

    dfs(0)
    return out


def permutations(items):
    path, used, out = [], set(), []

    def dfs():
        if len(path) == len(items):
            out.append(path[:])
            return
        for i, item in enumerate(items):
            if i in used:
                continue
            used.add(i)
            path.append(item)
            dfs()
            path.pop()
            used.remove(i)

    dfs()
    return out


def combination_sum(candidates, target):
    candidates.sort()
    path, out = [], []

    def dfs(start, total):
        if total == target:
            out.append(path[:])
            return
        for i in range(start, len(candidates)):
            if total + candidates[i] > target:
                break
            path.append(candidates[i])
            dfs(i, total + candidates[i])
            path.pop()

    dfs(0, 0)
    return out


def palindrome_partitions(text):
    path, out = [], []

    def dfs(start):
        if start == len(text):
            out.append(path[:])
            return
        for end in range(start + 1, len(text) + 1):
            piece = text[start:end]
            if piece == piece[::-1]:
                path.append(piece)
                dfs(end)
                path.pop()

    dfs(0)
    return out


def climb_stairs(n):
    if n <= 2:
        return n

    dp = [0] * (n + 1)
    dp[1], dp[2] = 1, 2

    for state in range(3, n + 1):
        candidates = [dp[state - 1], dp[state - 2]]
        dp[state] = sum(candidates)

    return dp[n]


def house_robber(nums):
    memo = {}

    def solve(state):
        if state >= len(nums):
            return 0
        if state in memo:
            return memo[state]

        candidates = [
            solve(state + 1),
            nums[state] + solve(state + 2),
        ]
        memo[state] = max(candidates)
        return memo[state]

    return solve(0)


def min_cost_climbing_stairs(cost):
    dp = [0] * (len(cost) + 1)

    for state in range(2, len(cost) + 1):
        candidates = [
            dp[state - 1] + cost[state - 1],
            dp[state - 2] + cost[state - 2],
        ]
        dp[state] = min(candidates)

    return dp[len(cost)]


def coin_change_min(coins, amount):
    dp = [0] + [float("inf")] * amount

    for state in range(1, amount + 1):
        candidates = []
        for coin in coins:
            if coin <= state:
                candidates.append(dp[state - coin] + 1)
        dp[state] = min(candidates, default=float("inf"))

    return -1 if dp[amount] == float("inf") else dp[amount]


def unique_paths(rows, cols):
    if rows <= 0 or cols <= 0:
        return 0

    dp = [[0] * cols for _ in range(rows)]
    dp[0][0] = 1

    for row in range(rows):
        for col in range(cols):
            if row == 0 and col == 0:
                continue

            candidates = []
            if row > 0:
                candidates.append(dp[row - 1][col])
            if col > 0:
                candidates.append(dp[row][col - 1])
            dp[row][col] = sum(candidates)

    return dp[rows - 1][cols - 1]


def longest_increasing_subsequence(nums):
    if not nums:
        return 0

    dp = [1] * len(nums)

    for state in range(len(nums)):
        candidates = [
            dp[previous_state] + 1
            for previous_state in range(state)
            if nums[previous_state] < nums[state]
        ]
        dp[state] = max(candidates, default=1)

    return max(dp)


def longest_common_subsequence(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]

    for row in range(1, len(a) + 1):
        for col in range(1, len(b) + 1):
            if a[row - 1] == b[col - 1]:
                dp[row][col] = dp[row - 1][col - 1] + 1
            else:
                candidates = [dp[row - 1][col], dp[row][col - 1]]
                dp[row][col] = max(candidates)

    return dp[len(a)][len(b)]


def keep_top_k(nums, k):
    heap = []
    for val in nums:
        heappush(heap, val)
        if len(heap) > k:
            heappop(heap)
    return heap


def kth_largest(nums, k):
    heap = keep_top_k(nums, k)
    return heap[0]


def merge_k_sorted_arrays(arrays):
    heap, out = [], []
    for row, arr in enumerate(arrays):
        if arr:
            heappush(heap, (arr[0], row, 0))
    while heap:
        val, row, col = heappop(heap)
        out.append(val)
        if col + 1 < len(arrays[row]):
            heappush(heap, (arrays[row][col + 1], row, col + 1))
    return out


def running_kth_largest(stream, k):
    heap, out = [], []
    for val in stream:
        heappush(heap, val)
        if len(heap) > k:
            heappop(heap)
        out.append(heap[0] if len(heap) == k else None)
    return out


def two_heap_medians(stream):
    low, high, out = [], [], []
    for val in stream:
        heappush(low, -val)
        heappush(high, -heappop(low))
        if len(high) > len(low):
            heappush(low, -heappop(high))
        if len(low) > len(high):
            out.append(float(-low[0]))
        else:
            out.append((-low[0] + high[0]) / 2)
    return out


def prune_deleted_heap(heap, deleted):
    while heap and deleted.get(heap[0], 0):
        val = heappop(heap)
        deleted[val] -= 1
    return heap[0] if heap else None


def init_parent(n):
    parent = list(range(n))
    size = [1] * n
    return parent, size


def find(parent, x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def union_by_size(parent, size, a, b):
    ra, rb = find(parent, a), find(parent, b)
    if ra == rb:
        return False
    if size[ra] < size[rb]:
        ra, rb = rb, ra
    parent[rb] = ra
    size[ra] += size[rb]
    return True


def count_components_union_find(n, edges):
    parent, size = init_parent(n)
    count = n
    for a, b in edges:
        if union_by_size(parent, size, a, b):
            count -= 1
    return count


def sort_intervals(intervals):
    return sorted(intervals, key=lambda item: (item[0], item[1]))


def merge_intervals(intervals):
    out = []
    for start, end in sort_intervals(intervals):
        if not out or start > out[-1][1]:
            out.append([start, end])
        else:
            out[-1][1] = max(out[-1][1], end)
    return out


def insert_interval(intervals, new_interval):
    out, i = [], 0
    while i < len(intervals) and intervals[i][1] < new_interval[0]:
        out.append(intervals[i])
        i += 1
    while i < len(intervals) and intervals[i][0] <= new_interval[1]:
        new_interval[0] = min(new_interval[0], intervals[i][0])
        new_interval[1] = max(new_interval[1], intervals[i][1])
        i += 1
    return out + [new_interval] + intervals[i:]


def min_meeting_rooms(intervals):
    starts = sorted(start for start, _ in intervals)
    ends = sorted(end for _, end in intervals)
    rooms = end_i = 0
    for start in starts:
        if start >= ends[end_i]:
            end_i += 1
        else:
            rooms += 1
    return rooms


def running_prefix(nums):
    total, prefix = 0, [0]
    for val in nums:
        total += val
        prefix.append(total)
    return prefix


def range_sum(prefix, left, right):
    return prefix[right + 1] - prefix[left]


def count_subarrays_sum(nums, target):
    seen, total, count = {0: 1}, 0, 0
    for val in nums:
        total += val
        count += seen.get(total - target, 0)
        seen[total] = seen.get(total, 0) + 1
    return count


def count_subarrays_divisible_by_k(nums, k):
    seen, total, count = {0: 1}, 0, 0
    for val in nums:
        total = (total + val) % k
        count += seen.get(total, 0)
        seen[total] = seen.get(total, 0) + 1
    return count


def matrix_prefix_sum(grid):
    rows, cols = len(grid), len(grid[0]) if grid else 0
    prefix = [[0] * (cols + 1) for _ in range(rows + 1)]
    for r in range(rows):
        for c in range(cols):
            prefix[r + 1][c + 1] = grid[r][c] + prefix[r][c + 1] + prefix[r + 1][c] - prefix[r][c]
    return prefix


def next_greater(nums):
    ans, stack = [-1] * len(nums), []
    for i, val in enumerate(nums):
        while stack and nums[stack[-1]] < val:
            ans[stack.pop()] = val
        stack.append(i)
    return ans


def daily_temperatures(temps):
    ans, stack = [0] * len(temps), []
    for i, temp in enumerate(temps):
        while stack and temps[stack[-1]] < temp:
            prev = stack.pop()
            ans[prev] = i - prev
        stack.append(i)
    return ans


def largest_rectangle_area(heights):
    stack, best = [], 0
    for i, height in enumerate(heights + [0]):
        while stack and heights[stack[-1]] > height:
            h = heights[stack.pop()]
            left = stack[-1] if stack else -1
            best = max(best, h * (i - left - 1))
        stack.append(i)
    return best


def sliding_window_max(nums, k):
    queue, out = deque(), []
    for i, val in enumerate(nums):
        while queue and queue[0] <= i - k:
            queue.popleft()
        while queue and nums[queue[-1]] <= val:
            queue.pop()
        queue.append(i)
        if i >= k - 1:
            out.append(nums[queue[0]])
    return out


def valid_parentheses(text):
    pairs, stack = {")": "(", "]": "[", "}": "{"}, []
    for ch in text:
        if ch in pairs.values():
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack


def eval_rpn(tokens):
    stack = []
    for token in tokens:
        if token not in {"+", "-", "*", "/"}:
            stack.append(int(token))
            continue
        b, a = stack.pop(), stack.pop()
        if token == "+":
            stack.append(a + b)
        elif token == "-":
            stack.append(a - b)
        elif token == "*":
            stack.append(a * b)
        else:
            stack.append(int(a / b))
    return stack[-1]


def simplify_path(path):
    stack = []
    for part in path.split("/"):
        if part in {"", "."}:
            continue
        if part == "..":
            if stack:
                stack.pop()
        else:
            stack.append(part)
    return "/" + "/".join(stack)


def decode_string(text):
    stack, current, number = [], "", 0
    for ch in text:
        if ch.isdigit():
            number = number * 10 + int(ch)
        elif ch == "[":
            stack.append((current, number))
            current, number = "", 0
        elif ch == "]":
            prev, repeat = stack.pop()
            current = prev + current * repeat
        else:
            current += ch
    return current


def min_stack_operations(operations):
    stack, mins, out = [], [], []
    for op in operations:
        if op[0] == "push":
            stack.append(op[1])
            mins.append(op[1] if not mins else min(op[1], mins[-1]))
        elif op[0] == "pop":
            stack.pop()
            mins.pop()
        elif op[0] == "min":
            out.append(mins[-1])
    return out


def reverse_list(head):
    prev, curr = None, head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev, curr = curr, nxt
    return prev


def merge_two_lists(a, b):
    dummy = type("ListNode", (), {})()
    tail = dummy
    while a and b:
        if a.val <= b.val:
            tail.next, a = a, a.next
        else:
            tail.next, b = b, b.next
        tail = tail.next
    tail.next = a or b
    return dummy.next


def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False


def middle_node(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow


def remove_nth_from_end(head, n):
    dummy = type("ListNode", (), {})()
    dummy.next = head
    fast = slow = dummy
    for _ in range(n):
        fast = fast.next
    while fast.next:
        fast = fast.next
        slow = slow.next
    slow.next = slow.next.next
    return dummy.next


def grid_neighbors(grid, row, col):
    rows, cols = len(grid), len(grid[0]) if grid else 0
    out = []
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nr, nc = row + dr, col + dc
        if 0 <= nr < rows and 0 <= nc < cols:
            out.append((nr, nc))
    return out


def flood_fill(image, sr, sc, color):
    original = image[sr][sc]
    if original == color:
        return image
    queue = deque([(sr, sc)])
    image[sr][sc] = color
    while queue:
        row, col = queue.popleft()
        for nr, nc in grid_neighbors(image, row, col):
            if image[nr][nc] == original:
                image[nr][nc] = color
                queue.append((nr, nc))
    return image


def num_islands(grid):
    rows, cols, count = len(grid), len(grid[0]) if grid else 0, 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] != "1":
                continue
            count += 1
            q = deque([(r, c)])
            grid[r][c] = "0"
            while q:
                row, col = q.popleft()
                for nr, nc in grid_neighbors(grid, row, col):
                    if grid[nr][nc] == "1":
                        grid[nr][nc] = "0"
                        q.append((nr, nc))
    return count


def oranges_rotting(grid):
    rows, cols = len(grid), len(grid[0]) if grid else 0
    queue, fresh = deque(), 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                queue.append((r, c, 0))
            elif grid[r][c] == 1:
                fresh += 1
    minutes = 0
    while queue:
        row, col, minutes = queue.popleft()
        for nr, nc in grid_neighbors(grid, row, col):
            if grid[nr][nc] == 1:
                grid[nr][nc] = 2
                fresh -= 1
                queue.append((nr, nc, minutes + 1))
    return minutes if fresh == 0 else -1


def shortest_path_grid(grid, start, target):
    q, seen = deque([(start[0], start[1], 0)]), {start}
    while q:
        row, col, dist = q.popleft()
        if (row, col) == target:
            return dist
        for nr, nc in grid_neighbors(grid, row, col):
            if grid[nr][nc] == 0 and (nr, nc) not in seen:
                seen.add((nr, nc))
                q.append((nr, nc, dist + 1))
    return -1


def spiral_order(matrix):
    out = []
    top, bottom = 0, len(matrix) - 1
    left, right = 0, len(matrix[0]) - 1 if matrix else -1
    while top <= bottom and left <= right:
        out.extend(matrix[top][left : right + 1])
        top += 1
        for row in range(top, bottom + 1):
            out.append(matrix[row][right])
        right -= 1
        if top <= bottom:
            out.extend(reversed(matrix[bottom][left : right + 1]))
            bottom -= 1
        if left <= right:
            for row in range(bottom, top - 1, -1):
                out.append(matrix[row][left])
            left += 1
    return out


def trie_insert(root, word):
    node = root
    for ch in word:
        node = node.setdefault(ch, {})
    node["$"] = True
    return root


def trie_search(root, word):
    node = root
    for ch in word:
        if ch not in node:
            return False
        node = node[ch]
    return "$" in node


def trie_starts_with(root, prefix):
    node = root
    for ch in prefix:
        if ch not in node:
            return False
        node = node[ch]
    return True


def word_dictionary_search(root, pattern):
    def dfs(node, i):
        if i == len(pattern):
            return "$" in node
        ch = pattern[i]
        if ch == ".":
            return any(key != "$" and dfs(child, i + 1) for key, child in node.items())
        return ch in node and dfs(node[ch], i + 1)

    return dfs(root, 0)


def sort_by_key(items, key):
    return sorted(items, key=key)


def erase_overlap_intervals(intervals):
    intervals = sorted(intervals, key=lambda item: item[1])
    removed, prev_end = 0, float("-inf")
    for start, end in intervals:
        if start >= prev_end:
            prev_end = end
        else:
            removed += 1
    return removed


def can_jump(nums):
    if not nums:
        return True

    dp = [False] * len(nums)
    dp[0] = True

    for state in range(1, len(nums)):
        candidates = [
            dp[previous_state]
            and previous_state + nums[previous_state] >= state
            for previous_state in range(state)
        ]
        dp[state] = any(candidates)

    return dp[-1]


def jump_game_min_jumps(nums):
    if len(nums) <= 1:
        return 0

    dp = [float("inf")] * len(nums)
    dp[0] = 0

    for state in range(1, len(nums)):
        candidates = [
            dp[previous_state] + 1
            for previous_state in range(state)
            if previous_state + nums[previous_state] >= state
        ]
        dp[state] = min(candidates, default=float("inf"))

    return -1 if dp[-1] == float("inf") else dp[-1]


def partition_labels(text):
    last = {ch: i for i, ch in enumerate(text)}
    start = end = 0
    out = []
    for i, ch in enumerate(text):
        end = max(end, last[ch])
        if i == end:
            out.append(end - start + 1)
            start = i + 1
    return out


def build_indegree(graph):
    indegree = {node: 0 for node in graph}
    for node, neighbors in graph.items():
        for nxt in neighbors:
            indegree[nxt] = indegree.get(nxt, 0) + 1
    return indegree


def topo_order(graph):
    indegree = build_indegree(graph)
    q = deque([node for node, deg in indegree.items() if deg == 0])
    order = []
    while q:
        node = q.popleft()
        order.append(node)
        for nxt in graph.get(node, []):
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                q.append(nxt)
    return order


def has_cycle_directed(graph):
    return len(topo_order(graph)) != len(build_indegree(graph))
