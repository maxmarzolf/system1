export const top150CardOptions: Record<string, { code: string; correct: boolean }[]> = {
  // 88 – Merge Sorted Array
  '88': [
    { code: 'nums1[k] = nums2[j]', correct: true },
    { code: 'nums1[k] = nums1[j]', correct: false },
    { code: 'nums2[k] = nums1[j]', correct: false },
    { code: 'nums1[j] = nums2[k]', correct: false },
  ],

  // 27 – Remove Element
  '27': [
    { code: 'nums[k] = nums[i]', correct: true },
    { code: 'nums[i] = nums[k]', correct: false },
    { code: 'nums[k] = nums[k + 1]', correct: false },
    { code: 'nums[k] = val', correct: false },
  ],

  // 26 – Remove Duplicates from Sorted Array
  '26': [
    { code: 'nums[k] = nums[i]', correct: true },
    { code: 'nums[i] = nums[k]', correct: false },
    { code: 'nums[k] = nums[i - 1]', correct: false },
    { code: 'nums[k + 1] = nums[i]', correct: false },
  ],

  // 80 – Remove Duplicates from Sorted Array II
  '80': [
    { code: 'if k < 2 or x != nums[k - 2]:', correct: true },
    { code: 'if k < 2 or x != nums[k - 1]:', correct: false },
    { code: 'if k < 1 or x != nums[k - 2]:', correct: false },
    { code: 'if k <= 2 or x != nums[k - 2]:', correct: false },
  ],

  // 169 – Majority Element
  '169': [
    { code: 'candidate = num', correct: true },
    { code: 'candidate = count', correct: false },
    { code: 'count = num', correct: false },
    { code: 'candidate += 1', correct: false },
  ],

  // 189 – Rotate Array
  '189': [
    { code: 'reverse(0, n - 1)', correct: true },
    { code: 'reverse(0, k - 1)', correct: false },
    { code: 'reverse(k, n - 1)', correct: false },
    { code: 'reverse(0, n)', correct: false },
  ],

  // 121 – Best Time to Buy and Sell Stock
  '121': [
    { code: 'min_price = min(min_price, price)', correct: true },
    { code: 'min_price = max(min_price, price)', correct: false },
    { code: 'min_price = min(max_profit, price)', correct: false },
    { code: 'min_price = price', correct: false },
  ],

  // 122 – Best Time to Buy and Sell Stock II
  '122': [
    { code: 'profit += max(0, prices[i] - prices[i - 1])', correct: true },
    { code: 'profit += prices[i] - prices[i - 1]', correct: false },
    { code: 'profit += max(0, prices[i] - prices[i + 1])', correct: false },
    { code: 'profit = max(profit, prices[i] - prices[i - 1])', correct: false },
  ],

  // 55 – Jump Game
  '55': [
    { code: 'farthest = max(farthest, i + nums[i])', correct: true },
    { code: 'farthest = max(farthest, nums[i])', correct: false },
    { code: 'farthest = max(farthest, i * nums[i])', correct: false },
    { code: 'farthest = max(farthest, i + nums[i] - 1)', correct: false },
  ],

  // 45 – Jump Game II
  '45': [
    { code: 'cur_end = farthest', correct: true },
    { code: 'cur_end = i + 1', correct: false },
    { code: 'farthest = cur_end', correct: false },
    { code: 'cur_end = farthest + 1', correct: false },
  ],

  // 274 – H-Index
  '274': [
    { code: 'if c >= i + 1:', correct: true },
    { code: 'if c > i + 1:', correct: false },
    { code: 'if c >= i:', correct: false },
    { code: 'if c == i + 1:', correct: false },
  ],

  // 380 – Insert Delete GetRandom O(1)
  '380': [
    { code: 'self.idx[last] = i', correct: true },
    { code: 'self.idx[val] = i', correct: false },
    { code: 'self.idx[last] = len(self.vals)', correct: false },
    { code: 'self.idx[i] = last', correct: false },
  ],

  // 238 – Product of Array Except Self
  '238': [
    { code: 'answer[i] *= suffix', correct: true },
    { code: 'answer[i] += suffix', correct: false },
    { code: 'answer[i] = suffix', correct: false },
    { code: 'answer[i] *= prefix', correct: false },
  ],

  // 134 – Gas Station
  '134': [
    { code: 'start = i + 1', correct: true },
    { code: 'start = i', correct: false },
    { code: 'start += 1', correct: false },
    { code: 'start = i - 1', correct: false },
  ],

  // 135 – Candy
  '135': [
    { code: 'candies[i] = max(candies[i], candies[i + 1] + 1)', correct: true },
    { code: 'candies[i] = candies[i + 1] + 1', correct: false },
    { code: 'candies[i] = max(candies[i], candies[i - 1] + 1)', correct: false },
    { code: 'candies[i] = max(candies[i], candies[i + 1])', correct: false },
  ],

  // 42 – Trapping Rain Water
  '42': [
    { code: 'water += l_max - height[l]', correct: true },
    { code: 'water += r_max - height[l]', correct: false },
    { code: 'water += l_max - height[r]', correct: false },
    { code: 'water += height[l] - l_max', correct: false },
  ],

  // 13 – Roman to Integer
  '13': [
    { code: 'result -= m[s[i]]', correct: true },
    { code: 'result += m[s[i]]', correct: false },
    { code: 'result -= m[s[i + 1]]', correct: false },
    { code: 'result -= m[s[i - 1]]', correct: false },
  ],

  // 12 – Integer to Roman
  '12': [
    { code: 'result.append(sym)', correct: true },
    { code: 'result.append(val)', correct: false },
    { code: 'result.append(str(val))', correct: false },
    { code: 'result += sym', correct: false },
  ],

  // 58 – Length of Last Word
  '58': [
    { code: 's = s.strip()', correct: true },
    { code: 's = s.lstrip()', correct: false },
    { code: 's = s.replace(" ", "")', correct: false },
    { code: 's = s.rstrip()', correct: false },
  ],

  // 14 – Longest Common Prefix
  '14': [
    { code: 'prefix = prefix[:-1]', correct: true },
    { code: 'prefix = prefix[1:]', correct: false },
    { code: 'prefix = prefix[:len(prefix) // 2]', correct: false },
    { code: 'prefix = prefix[:-2]', correct: false },
  ],

  // 151 – Reverse Words in a String
  '151': [
    { code: "words = s.split()[::-1]", correct: true },
    { code: "words = s.split()[::]", correct: false },
    { code: "words = s.split(' ')[::-1]", correct: false },
    { code: "words = list(reversed(s))", correct: false },
  ],

  // 6 – Zigzag Conversion
  '6': [
    { code: 'going_down = not going_down', correct: true },
    { code: 'going_down = True', correct: false },
    { code: 'going_down = False', correct: false },
    { code: 'cur_row = 0', correct: false },
  ],

  // 28 – Find the Index of the First Occurrence in a String
  '28': [
    { code: 'return haystack.find(needle)', correct: true },
    { code: 'return haystack.index(needle)', correct: false },
    { code: 'return haystack.rfind(needle)', correct: false },
    { code: 'return haystack.find(needle, 1)', correct: false },
  ],

  // 68 – Text Justification
  '68': [
    { code: "line[i % (len(line) - 1 or 1)] += ' '", correct: true },
    { code: "line[i % len(line)] += ' '", correct: false },
    { code: "line[i % (len(line) - 1)] += ' '", correct: false },
    { code: "line[(i + 1) % (len(line) - 1 or 1)] += ' '", correct: false },
  ],

  // 125 – Valid Palindrome
  '125': [
    { code: "if s[l].lower() != s[r].lower():", correct: true },
    { code: "if s[l] != s[r]:", correct: false },
    { code: "if s[l].upper() != s[r].upper():", correct: false },
    { code: "if s[l].lower() != s[r]:", correct: false },
  ],

  // 392 – Is Subsequence
  '392': [
    { code: 'i += 1', correct: true },
    { code: 'i -= 1', correct: false },
    { code: 'i = len(s)', correct: false },
    { code: 'i += 2', correct: false },
  ],

  // 167 – Two Sum II
  '167': [
    { code: 'r -= 1', correct: true },
    { code: 'l += 1', correct: false },
    { code: 'r += 1', correct: false },
    { code: 'l -= 1', correct: false },
  ],

  // 11 – Container With Most Water
  '11': [
    { code: 'if height[l] < height[r]:', correct: true },
    { code: 'if height[l] > height[r]:', correct: false },
    { code: 'if height[l] <= height[r]:', correct: false },
    { code: 'if l < r:', correct: false },
  ],

  // 15 – 3Sum
  '15': [
    { code: 'l += 1; r -= 1', correct: true },
    { code: 'l += 1', correct: false },
    { code: 'r -= 1', correct: false },
    { code: 'l -= 1; r += 1', correct: false },
  ],

  // 209 – Minimum Size Subarray Sum
  '209': [
    { code: 'ans = min(ans, r - l + 1)', correct: true },
    { code: 'ans = min(ans, r - l)', correct: false },
    { code: 'ans = max(ans, r - l + 1)', correct: false },
    { code: 'ans = min(ans, r + l + 1)', correct: false },
  ],

  // 3 – Longest Substring Without Repeating Characters
  '3': [
    { code: 'seen[c] = r', correct: true },
    { code: 'seen[c] = l', correct: false },
    { code: 'seen[r] = c', correct: false },
    { code: 'seen[c] = r + 1', correct: false },
  ],

  // 30 – Substring with Concatenation of All Words
  '30': [
    { code: 'if count == len(words):', correct: true },
    { code: 'if count == len(words) - 1:', correct: false },
    { code: 'if count >= len(words):', correct: false },
    { code: 'if count == w_len:', correct: false },
  ],

  // 76 – Minimum Window Substring
  '76': [
    { code: 'if need[s[l]] > 0: missing += 1', correct: true },
    { code: 'if need[s[l]] >= 0: missing += 1', correct: false },
    { code: 'if need[s[l]] > 0: missing -= 1', correct: false },
    { code: 'if need[s[r]] > 0: missing += 1', correct: false },
  ],

  // 36 – Valid Sudoku
  '36': [
    { code: 'box = (i // 3) * 3 + j // 3', correct: true },
    { code: 'box = (i // 3) + (j // 3) * 3', correct: false },
    { code: 'box = (i % 3) * 3 + j % 3', correct: false },
    { code: 'box = (i // 3) * 3 + j % 3', correct: false },
  ],

  // 54 – Spiral Matrix
  '54': [
    { code: 'res += matrix.pop(0)', correct: true },
    { code: 'res += matrix.pop()', correct: false },
    { code: 'res.append(matrix.pop(0))', correct: false },
    { code: 'res += matrix.pop(0)[0]', correct: false },
  ],

  // 48 – Rotate Image
  '48': [
    { code: 'row.reverse()', correct: true },
    { code: 'row.sort()', correct: false },
    { code: 'row = row[::-1]', correct: false },
    { code: 'row.reverse(); row.reverse()', correct: false },
  ],

  // 73 – Set Matrix Zeroes
  '73': [
    { code: 'if matrix[i][0] == 0 or matrix[0][j] == 0:', correct: true },
    { code: 'if matrix[i][0] == 0 and matrix[0][j] == 0:', correct: false },
    { code: 'if matrix[i][j] == 0 or matrix[0][j] == 0:', correct: false },
    { code: 'if matrix[0][i] == 0 or matrix[j][0] == 0:', correct: false },
  ],

  // 289 – Game of Life
  '289': [
    { code: 'board[i][j] = 2', correct: true },
    { code: 'board[i][j] = -1', correct: false },
    { code: 'board[i][j] = 1', correct: false },
    { code: 'board[i][j] = 3', correct: false },
  ],

  // 383 – Ransom Note
  '383': [
    { code: 'return not (Counter(ransomNote) - Counter(magazine))', correct: true },
    { code: 'return not (Counter(magazine) - Counter(ransomNote))', correct: false },
    { code: 'return Counter(ransomNote) == Counter(magazine)', correct: false },
    { code: 'return Counter(ransomNote) <= Counter(magazine)', correct: false },
  ],

  // 205 – Isomorphic Strings
  '205': [
    { code: 's_map[a] = b', correct: true },
    { code: 's_map[b] = a', correct: false },
    { code: 's_map[a] = a', correct: false },
    { code: 't_map[a] = b', correct: false },
  ],

  // 290 – Word Pattern
  '290': [
    { code: "return len(set(zip(pattern, words))) == len(set(pattern)) == len(set(words))", correct: true },
    { code: "return len(set(zip(pattern, words))) == len(set(pattern))", correct: false },
    { code: "return len(set(pattern)) == len(set(words))", correct: false },
    { code: "return set(zip(pattern, words)) == set(pattern)", correct: false },
  ],

  // 242 – Valid Anagram
  '242': [
    { code: 'return Counter(s) == Counter(t)', correct: true },
    { code: 'return sorted(s) == sorted(t)', correct: false },
    { code: 'return Counter(s) <= Counter(t)', correct: false },
    { code: 'return set(s) == set(t)', correct: false },
  ],

  // 49 – Group Anagrams
  '49': [
    { code: "groups[tuple(sorted(s))].append(s)", correct: true },
    { code: "groups[sorted(s)].append(s)", correct: false },
    { code: "groups[tuple(s)].append(s)", correct: false },
    { code: "groups[str(sorted(s))].append(s)", correct: false },
  ],

  // 1 – Two Sum
  '1': [
    { code: 'seen[num] = i', correct: true },
    { code: 'seen[i] = num', correct: false },
    { code: 'seen[complement] = i', correct: false },
    { code: 'seen[num] = complement', correct: false },
  ],

  // 202 – Happy Number
  '202': [
    { code: 'seen.add(n)', correct: true },
    { code: 'seen.add(n + 1)', correct: false },
    { code: 'seen.append(n)', correct: false },
    { code: 'seen.update(n)', correct: false },
  ],

  // 219 – Contains Duplicate II
  '219': [
    { code: 'if num in seen and i - seen[num] <= k:', correct: true },
    { code: 'if num in seen and i - seen[num] < k:', correct: false },
    { code: 'if num in seen and seen[num] - i <= k:', correct: false },
    { code: 'if num in seen and abs(i - seen[num]) < k:', correct: false },
  ],

  // 128 – Longest Consecutive Sequence
  '128': [
    { code: 'if n - 1 not in num_set:', correct: true },
    { code: 'if n + 1 not in num_set:', correct: false },
    { code: 'if n - 1 in num_set:', correct: false },
    { code: 'if n not in num_set:', correct: false },
  ],

  // 228 – Summary Ranges
  '228': [
    { code: "res.append(str(start) if start == nums[i] else f'{start}->{nums[i]}')", correct: true },
    { code: "res.append(str(start) if start == nums[i] else f'{nums[i]}->{start}')", correct: false },
    { code: "res.append(f'{start}->{nums[i]}')", correct: false },
    { code: "res.append(str(start) if start != nums[i] else f'{start}->{nums[i]}')", correct: false },
  ],

  // 56 – Merge Intervals
  '56': [
    { code: 'merged[-1][1] = max(merged[-1][1], end)', correct: true },
    { code: 'merged[-1][1] = end', correct: false },
    { code: 'merged[-1][0] = min(merged[-1][0], start)', correct: false },
    { code: 'merged[-1][1] = max(merged[-1][0], end)', correct: false },
  ],

  // 57 – Insert Interval
  '57': [
    { code: 'newInterval = [min(s, newInterval[0]), max(e, newInterval[1])]', correct: true },
    { code: 'newInterval = [max(s, newInterval[0]), min(e, newInterval[1])]', correct: false },
    { code: 'newInterval = [min(s, newInterval[0]), max(s, newInterval[1])]', correct: false },
    { code: 'newInterval = [min(e, newInterval[0]), max(s, newInterval[1])]', correct: false },
  ],

  // 452 – Minimum Number of Arrows to Burst Balloons
  '452': [
    { code: 'end = e', correct: true },
    { code: 'end = s', correct: false },
    { code: 'end = max(end, e)', correct: false },
    { code: 'end = min(end, e)', correct: false },
  ],

  // 71 – Simplify Path
  '71': [
    { code: 'stack.append(part)', correct: true },
    { code: 'stack.append("/" + part)', correct: false },
    { code: 'stack.insert(0, part)', correct: false },
    { code: 'stack.extend(part)', correct: false },
  ],

  // 150 – Evaluate Reverse Polish Notation
  '150': [
    { code: 'stack.append(int(t))', correct: true },
    { code: 'stack.append(t)', correct: false },
    { code: 'stack.append(float(t))', correct: false },
    { code: 'stack.insert(0, int(t))', correct: false },
  ],

  // 224 – Basic Calculator
  '224': [
    { code: 'result *= stack.pop()', correct: true },
    { code: 'result += stack.pop()', correct: false },
    { code: 'result = stack.pop()', correct: false },
    { code: 'result //= stack.pop()', correct: false },
  ],

  // 141 – Linked List Cycle
  '141': [
    { code: 'fast = fast.next.next', correct: true },
    { code: 'fast = fast.next', correct: false },
    { code: 'slow = slow.next.next', correct: false },
    { code: 'fast = fast.next.next.next', correct: false },
  ],

  // 2 – Add Two Numbers
  '2': [
    { code: 'carry = val // 10', correct: true },
    { code: 'carry = val % 10', correct: false },
    { code: 'carry = val // 2', correct: false },
    { code: 'carry = val - 10', correct: false },
  ],

  // 21 – Merge Two Sorted Lists
  '21': [
    { code: 'cur.next = l1 or l2', correct: true },
    { code: 'cur.next = l1 and l2', correct: false },
    { code: 'cur.next = l2 or l1', correct: false },
    { code: 'cur.next = l1 if l1 else None', correct: false },
  ],

  // 138 – Copy List with Random Pointer
  '138': [
    { code: 'old_to_new[cur].random = old_to_new.get(cur.random)', correct: true },
    { code: 'old_to_new[cur].random = cur.random', correct: false },
    { code: 'old_to_new[cur].random = old_to_new.get(cur.next)', correct: false },
    { code: 'old_to_new[cur].next = old_to_new.get(cur.random)', correct: false },
  ],

  // 92 – Reverse Linked List II
  '92': [
    { code: 'cur.next = temp.next; temp.next = prev.next', correct: true },
    { code: 'temp.next = cur.next; cur.next = prev.next', correct: false },
    { code: 'cur.next = temp.next; prev.next = temp', correct: false },
    { code: 'temp.next = prev.next; cur.next = temp.next', correct: false },
  ],

  // 25 – Reverse Nodes in k-Group
  '25': [
    { code: 'nxt = cur.next; cur.next = prev', correct: true },
    { code: 'cur.next = prev; nxt = cur.next', correct: false },
    { code: 'nxt = cur.next; prev.next = cur', correct: false },
    { code: 'prev = cur.next; cur.next = nxt', correct: false },
  ],

  // 19 – Remove Nth Node From End of List
  '19': [
    { code: 'slow.next = slow.next.next', correct: true },
    { code: 'slow = slow.next.next', correct: false },
    { code: 'slow.next = slow.next', correct: false },
    { code: 'fast.next = slow.next.next', correct: false },
  ],

  // 82 – Remove Duplicates from Sorted List II
  '82': [
    { code: 'prev.next = head.next', correct: true },
    { code: 'prev.next = head', correct: false },
    { code: 'prev = head.next', correct: false },
    { code: 'head.next = prev.next', correct: false },
  ],

  // 61 – Rotate List
  '61': [
    { code: 'tail.next = head', correct: true },
    { code: 'head.next = tail', correct: false },
    { code: 'tail.next = tail', correct: false },
    { code: 'tail = head', correct: false },
  ],

  // 86 – Partition List
  '86': [
    { code: 'b.next = after.next', correct: true },
    { code: 'b.next = after', correct: false },
    { code: 'a.next = before.next', correct: false },
    { code: 'b.next = before.next', correct: false },
  ],

  // 146 – LRU Cache
  '146': [
    { code: 'self.cache.move_to_end(key)', correct: true },
    { code: 'self.cache.pop(key)', correct: false },
    { code: 'self.cache.move_to_end(key, last=False)', correct: false },
    { code: 'self.cache[key] = self.cache.pop(key)', correct: false },
  ],

  // 105 – Construct Binary Tree from Preorder and Inorder
  '105': [
    { code: 'mid = inorder.index(preorder[0])', correct: true },
    { code: 'mid = preorder.index(inorder[0])', correct: false },
    { code: 'mid = inorder.index(preorder[-1])', correct: false },
    { code: 'mid = len(inorder) // 2', correct: false },
  ],

  // 106 – Construct Binary Tree from Inorder and Postorder
  '106': [
    { code: 'mid = inorder.index(postorder[-1])', correct: true },
    { code: 'mid = inorder.index(postorder[0])', correct: false },
    { code: 'mid = postorder.index(inorder[-1])', correct: false },
    { code: 'mid = len(inorder) // 2', correct: false },
  ],

  // 117 – Populating Next Right Pointers in Each Node II
  '117': [
    { code: 'node = dummy.next', correct: true },
    { code: 'node = dummy', correct: false },
    { code: 'node = cur.next', correct: false },
    { code: 'node = node.next', correct: false },
  ],

  // 114 – Flatten Binary Tree to Linked List
  '114': [
    { code: 'prev.right = cur.right', correct: true },
    { code: 'prev.left = cur.right', correct: false },
    { code: 'cur.right = prev.right', correct: false },
    { code: 'prev.right = cur.left', correct: false },
  ],

  // 129 – Sum Root to Leaf Numbers
  '129': [
    { code: 'cur = cur * 10 + root.val', correct: true },
    { code: 'cur = cur + root.val * 10', correct: false },
    { code: 'cur = cur * 10 + root.left.val', correct: false },
    { code: 'cur = cur * 2 + root.val', correct: false },
  ],

  // 124 – Binary Tree Maximum Path Sum
  '124': [
    { code: 'ans[0] = max(ans[0], node.val + left + right)', correct: true },
    { code: 'ans[0] = max(ans[0], left + right)', correct: false },
    { code: 'ans[0] = max(ans[0], node.val + max(left, right))', correct: false },
    { code: 'ans[0] = node.val + left + right', correct: false },
  ],

  // 173 – Binary Search Tree Iterator
  '173': [
    { code: 'self._push_left(node.right)', correct: true },
    { code: 'self._push_left(node.left)', correct: false },
    { code: 'self._push_left(node)', correct: false },
    { code: 'self.stack.append(node.right)', correct: false },
  ],

  // 222 – Count Complete Tree Nodes
  '222': [
    { code: 'if left_h == right_h:', correct: true },
    { code: 'if left_h > right_h:', correct: false },
    { code: 'if left_h != right_h:', correct: false },
    { code: 'if left_h >= right_h:', correct: false },
  ],

  // 236 – Lowest Common Ancestor
  '236': [
    { code: 'if left and right: return root', correct: true },
    { code: 'if left or right: return root', correct: false },
    { code: 'if left and right: return left', correct: false },
    { code: 'if left and right: return None', correct: false },
  ],

  // 199 – Binary Tree Right Side View
  '199': [
    { code: 'res.append(q[-1].val)', correct: true },
    { code: 'res.append(q[0].val)', correct: false },
    { code: 'res.append(q[-1])', correct: false },
    { code: 'res.append(q[-1].left)', correct: false },
  ],

  // 637 – Average of Levels in Binary Tree
  '637': [
    { code: 'res.append(level_sum / size)', correct: true },
    { code: 'res.append(level_sum // size)', correct: false },
    { code: 'res.append(level_sum / len(q))', correct: false },
    { code: 'res.append(size / level_sum)', correct: false },
  ],

  // 102 – Binary Tree Level Order Traversal
  '102': [
    { code: 'level.append(node.val)', correct: true },
    { code: 'level.append(node)', correct: false },
    { code: 'res.append(node.val)', correct: false },
    { code: 'level.append(node.left)', correct: false },
  ],

  // 103 – Binary Tree Zigzag Level Order Traversal
  '103': [
    { code: 'res.append(level if left_to_right else level[::-1])', correct: true },
    { code: 'res.append(level[::-1] if left_to_right else level)', correct: false },
    { code: 'res.append(level if left_to_right else reversed(level))', correct: false },
    { code: 'res.append(level if not left_to_right else level[::-1])', correct: false },
  ],

  // 230 – Kth Smallest Element in a BST
  '230': [
    { code: 'if k == 0:', correct: true },
    { code: 'if k == 1:', correct: false },
    { code: 'if k <= 0:', correct: false },
    { code: 'if k < 0:', correct: false },
  ],

  // 98 – Validate Binary Search Tree
  '98': [
    { code: 'if root.val <= lo or root.val >= hi:', correct: true },
    { code: 'if root.val < lo or root.val > hi:', correct: false },
    { code: 'if root.val <= lo or root.val > hi:', correct: false },
    { code: 'if root.val < lo or root.val >= hi:', correct: false },
  ],

  // 200 – Number of Islands
  '200': [
    { code: "grid[i][j] = '0'", correct: true },
    { code: "grid[i][j] = '1'", correct: false },
    { code: "grid[i][j] = '#'", correct: false },
    { code: "grid[i][j] = 0", correct: false },
  ],

  // 130 – Surrounded Regions
  '130': [
    { code: "board[i][j] = 'S'", correct: true },
    { code: "board[i][j] = 'X'", correct: false },
    { code: "board[i][j] = 'O'", correct: false },
    { code: "board[i][j] = '#'", correct: false },
  ],

  // 133 – Clone Graph
  '133': [
    { code: 'clones[n] = clone', correct: true },
    { code: 'clones[clone] = n', correct: false },
    { code: 'clones[n.val] = clone', correct: false },
    { code: 'clones[n] = n', correct: false },
  ],

  // 399 – Evaluate Division
  '399': [
    { code: 'res = dfs(nei, dst, visited)', correct: true },
    { code: 'res = dfs(src, dst, visited)', correct: false },
    { code: 'res = dfs(nei, src, visited)', correct: false },
    { code: 'res = dfs(dst, nei, visited)', correct: false },
  ],

  // 207 – Course Schedule
  '207': [
    { code: 'if indegree[nei] == 0:', correct: true },
    { code: 'if indegree[nei] == 1:', correct: false },
    { code: 'if indegree[nei] <= 0:', correct: false },
    { code: 'if indegree[node] == 0:', correct: false },
  ],

  // 210 – Course Schedule II
  '210': [
    { code: 'order.append(node)', correct: true },
    { code: 'order.append(nei)', correct: false },
    { code: 'order.insert(0, node)', correct: false },
    { code: 'order.append(indegree[node])', correct: false },
  ],

  // 684 – Redundant Connection
  '684': [
    { code: 'parent[rb] = ra', correct: true },
    { code: 'parent[ra] = rb', correct: false },
    { code: 'size[rb] += size[ra]', correct: false },
    { code: 'parent[b] = a', correct: false },
  ],

  // 909 – Snakes and Ladders
  '909': [
    { code: 'visited.add(ns)', correct: true },
    { code: 'visited.add(s)', correct: false },
    { code: 'visited.add(moves)', correct: false },
    { code: 'visited.add(ns + 1)', correct: false },
  ],

  // 433 – Minimum Genetic Mutation
  '433': [
    { code: "mutation = gene[:i] + c + gene[i + 1:]", correct: true },
    { code: "mutation = gene[:i] + c + gene[i:]", correct: false },
    { code: "mutation = gene[:i + 1] + c + gene[i + 1:]", correct: false },
    { code: "mutation = gene[:i] + gene[i + 1:] + c", correct: false },
  ],

  // 127 – Word Ladder
  '127': [
    { code: "nw = word[:i] + c + word[i + 1:]", correct: true },
    { code: "nw = word[:i] + c + word[i:]", correct: false },
    { code: "nw = word[:i + 1] + c + word[i + 1:]", correct: false },
    { code: "nw = word[:i] + word[i + 1:] + c", correct: false },
  ],

  // 208 – Implement Trie
  '208': [
    { code: 'node.is_end = True', correct: true },
    { code: 'node.is_end = False', correct: false },
    { code: 'self.root.is_end = True', correct: false },
    { code: 'node.children = True', correct: false },
  ],

  // 211 – Design Add and Search Words Data Structure
  '211': [
    { code: "return any(self.search(word[i + 1:], child) for child in node.children.values())", correct: true },
    { code: "return all(self.search(word[i + 1:], child) for child in node.children.values())", correct: false },
    { code: "return any(self.search(word[i:], child) for child in node.children.values())", correct: false },
    { code: "return any(self.search(word[i + 1:], node) for child in node.children.values())", correct: false },
  ],

  // 212 – Word Search II
  '212': [
    { code: 'if 0 <= ni < m and 0 <= nj < n:', correct: true },
    { code: 'if 0 < ni < m and 0 < nj < n:', correct: false },
    { code: 'if 0 <= ni <= m and 0 <= nj <= n:', correct: false },
    { code: 'if ni < m and nj < n:', correct: false },
  ],

  // 17 – Letter Combinations of a Phone Number
  '17': [
    { code: "for c in phone[digits[i]]:", correct: true },
    { code: "for c in digits[i]:", correct: false },
    { code: "for c in phone[i]:", correct: false },
    { code: "for c in phone[digits]:", correct: false },
  ],

  // 77 – Combinations
  '77': [
    { code: 'backtrack(i + 1, combo)', correct: true },
    { code: 'backtrack(i, combo)', correct: false },
    { code: 'backtrack(start + 1, combo)', correct: false },
    { code: 'backtrack(i + 2, combo)', correct: false },
  ],

  // 46 – Permutations
  '46': [
    { code: 'backtrack(path + [remaining[i]], remaining[:i] + remaining[i + 1:])', correct: true },
    { code: 'backtrack(path + [remaining[i]], remaining[:i + 1] + remaining[i + 1:])', correct: false },
    { code: 'backtrack(path + [remaining[i]], remaining[i + 1:])', correct: false },
    { code: 'backtrack(path + [remaining[i]], remaining[:i] + remaining[i:])', correct: false },
  ],

  // 39 – Combination Sum
  '39': [
    { code: 'backtrack(i, combo, total + candidates[i])', correct: true },
    { code: 'backtrack(i + 1, combo, total + candidates[i])', correct: false },
    { code: 'backtrack(i, combo, total + candidates[i] + 1)', correct: false },
    { code: 'backtrack(i - 1, combo, total + candidates[i])', correct: false },
  ],

  // 52 – N-Queens II
  '52': [
    { code: 'if col in cols or row - col in diag1 or row + col in diag2:', correct: true },
    { code: 'if col in cols or row + col in diag1 or row - col in diag2:', correct: false },
    { code: 'if col in cols or row - col in diag1 or row * col in diag2:', correct: false },
    { code: 'if col in rows or row - col in diag1 or row + col in diag2:', correct: false },
  ],

  // 22 – Generate Parentheses
  '22': [
    { code: 'if close_count < open_count:', correct: true },
    { code: 'if close_count <= open_count:', correct: false },
    { code: 'if close_count < n:', correct: false },
    { code: 'if open_count < close_count:', correct: false },
  ],

  // 79 – Word Search
  '79': [
    { code: 'found = dfs(i+1,j,k+1) or dfs(i-1,j,k+1) or dfs(i,j+1,k+1) or dfs(i,j-1,k+1)', correct: true },
    { code: 'found = dfs(i+1,j,k) or dfs(i-1,j,k) or dfs(i,j+1,k) or dfs(i,j-1,k)', correct: false },
    { code: 'found = dfs(i+1,j,k+1) and dfs(i-1,j,k+1) and dfs(i,j+1,k+1) and dfs(i,j-1,k+1)', correct: false },
    { code: 'found = dfs(i+1,j+1,k+1) or dfs(i-1,j-1,k+1) or dfs(i,j+1,k+1) or dfs(i,j-1,k+1)', correct: false },
  ],

  // 108 – Convert Sorted Array to BST
  '108': [
    { code: 'mid = len(nums) // 2', correct: true },
    { code: 'mid = len(nums) // 2 - 1', correct: false },
    { code: 'mid = len(nums) // 2 + 1', correct: false },
    { code: 'mid = (len(nums) - 1) // 2', correct: false },
  ],

  // 148 – Sort List
  '148': [
    { code: 'return merge(left, right)', correct: true },
    { code: 'return merge(right, left)', correct: false },
    { code: 'return merge(head, mid)', correct: false },
    { code: 'return sortList(merge(left, right))', correct: false },
  ],

  // 427 – Construct Quad Tree
  '427': [
    { code: 'return Node(tl.val, True)', correct: true },
    { code: 'return Node(tl.val, False)', correct: false },
    { code: 'return Node(True, tl.val)', correct: false },
    { code: 'return Node(tl.val, True, tl, tr, bl, br)', correct: false },
  ],

  // 23 – Merge k Sorted Lists
  '23': [
    { code: 'heapq.heappush(heap, (node.next.val, i, node.next))', correct: true },
    { code: 'heapq.heappush(heap, (node.val, i, node.next))', correct: false },
    { code: 'heapq.heappush(heap, (node.next.val, i, node))', correct: false },
    { code: 'heapq.heappush(heap, (node.next.val, i + 1, node.next))', correct: false },
  ],

  // 53 – Maximum Subarray
  '53': [
    { code: 'cur_sum = max(num, cur_sum + num)', correct: true },
    { code: 'cur_sum = max(0, cur_sum + num)', correct: false },
    { code: 'cur_sum = max(num, cur_sum)', correct: false },
    { code: 'cur_sum += num', correct: false },
  ],

  // 918 – Maximum Sum Circular Subarray
  '918': [
    { code: 'return max(max_sum, total - min_sum) if max_sum > 0 else max_sum', correct: true },
    { code: 'return max(max_sum, total - min_sum)', correct: false },
    { code: 'return max(max_sum, total - min_sum) if min_sum < 0 else max_sum', correct: false },
    { code: 'return max(max_sum, total + min_sum) if max_sum > 0 else max_sum', correct: false },
  ],

  // 35 – Search Insert Position
  '35': [
    { code: 'l = mid + 1', correct: true },
    { code: 'l = mid', correct: false },
    { code: 'r = mid + 1', correct: false },
    { code: 'l = mid - 1', correct: false },
  ],

  // 74 – Search a 2D Matrix
  '74': [
    { code: 'val = matrix[mid // n][mid % n]', correct: true },
    { code: 'val = matrix[mid % n][mid // n]', correct: false },
    { code: 'val = matrix[mid // m][mid % m]', correct: false },
    { code: 'val = matrix[mid // n][mid // n]', correct: false },
  ],

  // 162 – Find Peak Element
  '162': [
    { code: 'if nums[mid] > nums[mid + 1]:', correct: true },
    { code: 'if nums[mid] < nums[mid + 1]:', correct: false },
    { code: 'if nums[mid] >= nums[mid + 1]:', correct: false },
    { code: 'if nums[mid] > nums[mid - 1]:', correct: false },
  ],

  // 33 – Search in Rotated Sorted Array
  '33': [
    { code: 'if nums[mid] < target <= nums[r]:', correct: true },
    { code: 'if nums[mid] <= target <= nums[r]:', correct: false },
    { code: 'if nums[mid] < target < nums[r]:', correct: false },
    { code: 'if nums[l] < target <= nums[mid]:', correct: false },
  ],

  // 34 – Find First and Last Position
  '34': [
    { code: 'if left_bias: r = mid - 1\n                else: l = mid + 1', correct: true },
    { code: 'if left_bias: l = mid + 1\n                else: r = mid - 1', correct: false },
    { code: 'if left_bias: r = mid\n                else: l = mid', correct: false },
    { code: 'if left_bias: r = mid - 1\n                else: l = mid', correct: false },
  ],

  // 153 – Find Minimum in Rotated Sorted Array
  '153': [
    { code: 'if nums[mid] > nums[r]:', correct: true },
    { code: 'if nums[mid] < nums[r]:', correct: false },
    { code: 'if nums[mid] > nums[l]:', correct: false },
    { code: 'if nums[mid] >= nums[r]:', correct: false },
  ],

  // 4 – Median of Two Sorted Arrays
  '4': [
    { code: "if (m + n) % 2 == 0: return (max(left1, left2) + min(right1, right2)) / 2\n            else: return max(left1, left2)", correct: true },
    { code: "if (m + n) % 2 == 0: return (min(left1, left2) + max(right1, right2)) / 2\n            else: return max(left1, left2)", correct: false },
    { code: "if (m + n) % 2 == 1: return (max(left1, left2) + min(right1, right2)) / 2\n            else: return max(left1, left2)", correct: false },
    { code: "if (m + n) % 2 == 0: return (max(left1, left2) + min(right1, right2)) / 2\n            else: return min(right1, right2)", correct: false },
  ],

  // 215 – Kth Largest Element
  '215': [
    { code: 'if len(heap) > k:', correct: true },
    { code: 'if len(heap) >= k:', correct: false },
    { code: 'if len(heap) > k + 1:', correct: false },
    { code: 'if len(heap) == k:', correct: false },
  ],

  // 502 – IPO
  '502': [
    { code: 'heapq.heappush(heap, -projects[i][1])', correct: true },
    { code: 'heapq.heappush(heap, projects[i][1])', correct: false },
    { code: 'heapq.heappush(heap, -projects[i][0])', correct: false },
    { code: 'heapq.heappush(heap, (-projects[i][1], projects[i][0]))', correct: false },
  ],

  // 373 – Find K Pairs with Smallest Sums
  '373': [
    { code: 'heapq.heappush(heap, (nums1[i] + nums2[j + 1], i, j + 1))', correct: true },
    { code: 'heapq.heappush(heap, (nums1[i + 1] + nums2[j], i + 1, j))', correct: false },
    { code: 'heapq.heappush(heap, (nums1[i] + nums2[j], i, j + 1))', correct: false },
    { code: 'heapq.heappush(heap, (nums1[i] + nums2[j + 1], i + 1, j + 1))', correct: false },
  ],

  // 295 – Find Median from Data Stream
  '295': [
    { code: "heapq.heappush(self.hi, -heapq.heappop(self.lo))\n        if self.hi and -self.lo[0] > self.hi[0]: heapq.heappush(self.lo, -heapq.heappop(self.hi))", correct: true },
    { code: "heapq.heappush(self.lo, -heapq.heappop(self.hi))\n        if self.hi and -self.lo[0] > self.hi[0]: heapq.heappush(self.lo, -heapq.heappop(self.hi))", correct: false },
    { code: "heapq.heappush(self.hi, -heapq.heappop(self.lo))\n        if self.lo and -self.lo[0] > self.hi[0]: heapq.heappush(self.hi, -heapq.heappop(self.lo))", correct: false },
    { code: "heapq.heappush(self.hi, heapq.heappop(self.lo))\n        if self.hi and -self.lo[0] > self.hi[0]: heapq.heappush(self.lo, -heapq.heappop(self.hi))", correct: false },
  ],

  // 67 – Add Binary
  '67': [
    { code: "result.append(str(total % 2))", correct: true },
    { code: "result.append(str(total // 2))", correct: false },
    { code: "result.append(total % 2)", correct: false },
    { code: "result.append(str(total & 1))", correct: false },
  ],

  // 190 – Reverse Bits
  '190': [
    { code: 'result = (result << 1) | (n & 1)', correct: true },
    { code: 'result = (result >> 1) | (n & 1)', correct: false },
    { code: 'result = (result << 1) | (n >> 1)', correct: false },
    { code: 'result = (result << 1) & (n | 1)', correct: false },
  ],

  // 191 – Number of 1 Bits
  '191': [
    { code: 'n &= n - 1', correct: true },
    { code: 'n &= n + 1', correct: false },
    { code: 'n |= n - 1', correct: false },
    { code: 'n >>= 1', correct: false },
  ],

  // 136 – Single Number
  '136': [
    { code: 'result ^= num', correct: true },
    { code: 'result |= num', correct: false },
    { code: 'result &= num', correct: false },
    { code: 'result += num', correct: false },
  ],

  // 137 – Single Number II
  '137': [
    { code: 'ones = (ones ^ num) & ~twos', correct: true },
    { code: 'ones = (ones ^ num) & twos', correct: false },
    { code: 'ones = (ones & num) ^ ~twos', correct: false },
    { code: 'ones = (ones ^ num) | ~twos', correct: false },
  ],

  // 201 – Bitwise AND of Numbers Range
  '201': [
    { code: 'shift += 1', correct: true },
    { code: 'shift -= 1', correct: false },
    { code: 'shift *= 2', correct: false },
    { code: 'shift <<= 1', correct: false },
  ],

  // 9 – Palindrome Number
  '9': [
    { code: 'rev = rev * 10 + x % 10', correct: true },
    { code: 'rev = rev * 10 + x // 10', correct: false },
    { code: 'rev = rev + x % 10', correct: false },
    { code: 'rev = rev * 10 + x % 100', correct: false },
  ],

  // 66 – Plus One
  '66': [
    { code: 'digits[i] += 1', correct: true },
    { code: 'digits[i] = 1', correct: false },
    { code: 'digits[i] += 10', correct: false },
    { code: 'digits[i] = digits[i] + digits[i]', correct: false },
  ],

  // 172 – Factorial Trailing Zeroes
  '172': [
    { code: 'n //= 5', correct: true },
    { code: 'n //= 10', correct: false },
    { code: 'n //= 2', correct: false },
    { code: 'n %= 5', correct: false },
  ],

  // 69 – Sqrt(x)
  '69': [
    { code: 'ans = mid', correct: true },
    { code: 'ans = mid + 1', correct: false },
    { code: 'ans = mid - 1', correct: false },
    { code: 'ans = l', correct: false },
  ],

  // 50 – Pow(x, n)
  '50': [
    { code: 'x *= x', correct: true },
    { code: 'x += x', correct: false },
    { code: 'x **= 2', correct: false },
    { code: 'result *= x', correct: false },
  ],

  // 149 – Max Points on a Line
  '149': [
    { code: "if g != 0: dx, dy = dx // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1), dy // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1)", correct: true },
    { code: "if g != 0: dx, dy = dx // g, dy // g", correct: false },
    { code: "if g != 0: dx, dy = abs(dx // g), abs(dy // g)", correct: false },
    { code: "dx, dy = dx // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1), dy // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1)", correct: false },
  ],

  // 70 – Climbing Stairs
  '70': [
    { code: 'a, b = b, a + b', correct: true },
    { code: 'a, b = a + b, b', correct: false },
    { code: 'a, b = b, a * b', correct: false },
    { code: 'a, b = a, a + b', correct: false },
  ],

  // 198 – House Robber
  '198': [
    { code: 'temp = max(prev1, prev2 + num)', correct: true },
    { code: 'temp = max(prev2, prev1 + num)', correct: false },
    { code: 'temp = prev1 + prev2 + num', correct: false },
    { code: 'temp = max(prev1, prev2) + num', correct: false },
  ],

  // 139 – Word Break
  '139': [
    { code: 'if dp[j] and s[j:i] in word_set:', correct: true },
    { code: 'if dp[i] and s[j:i] in word_set:', correct: false },
    { code: 'if dp[j] and s[i:j] in word_set:', correct: false },
    { code: 'if dp[j] and s[j:i + 1] in word_set:', correct: false },
  ],

  // 322 – Coin Change
  '322': [
    { code: 'dp[i] = min(dp[i], dp[i - c] + 1)', correct: true },
    { code: 'dp[i] = min(dp[i], dp[i - c])', correct: false },
    { code: 'dp[i] = dp[i - c] + 1', correct: false },
    { code: 'dp[i] = min(dp[i], dp[i - 1] + c)', correct: false },
  ],

  // 300 – Longest Increasing Subsequence
  '300': [
    { code: 'if pos == len(tails):', correct: true },
    { code: 'if pos >= len(tails):', correct: false },
    { code: 'if pos == len(tails) - 1:', correct: false },
    { code: 'if pos > len(tails):', correct: false },
  ],

  // 120 – Triangle
  '120': [
    { code: 'dp[j] = triangle[i][j] + min(dp[j], dp[j + 1])', correct: true },
    { code: 'dp[j] = triangle[i][j] + max(dp[j], dp[j + 1])', correct: false },
    { code: 'dp[j] = triangle[i][j] + min(dp[j], dp[j - 1])', correct: false },
    { code: 'dp[j] = triangle[i][j] + dp[j] + dp[j + 1]', correct: false },
  ],

  // 64 – Minimum Path Sum
  '64': [
    { code: 'grid[i][j] += min(grid[i - 1][j], grid[i][j - 1])', correct: true },
    { code: 'grid[i][j] += max(grid[i - 1][j], grid[i][j - 1])', correct: false },
    { code: 'grid[i][j] += grid[i - 1][j] + grid[i][j - 1]', correct: false },
    { code: 'grid[i][j] = min(grid[i - 1][j], grid[i][j - 1])', correct: false },
  ],

  // 63 – Unique Paths II
  '63': [
    { code: 'dp[j] += dp[j - 1]', correct: true },
    { code: 'dp[j] = dp[j - 1]', correct: false },
    { code: 'dp[j] += dp[j + 1]', correct: false },
    { code: 'dp[j] += dp[j - 1] + 1', correct: false },
  ],

  // 5 – Longest Palindromic Substring
  '5': [
    { code: 'res = s[l:r + 1]', correct: true },
    { code: 'res = s[l:r]', correct: false },
    { code: 'res = s[l + 1:r + 1]', correct: false },
    { code: 'res = s[l:r + 2]', correct: false },
  ],

  // 97 – Interleaving String
  '97': [
    { code: "dp[j] = (dp[j] and s1[i - 1] == s3[i + j - 1]) or (dp[j - 1] and s2[j - 1] == s3[i + j - 1])", correct: true },
    { code: "dp[j] = (dp[j] and s1[i] == s3[i + j]) or (dp[j - 1] and s2[j] == s3[i + j])", correct: false },
    { code: "dp[j] = (dp[j] and s1[i - 1] == s3[i + j - 1]) and (dp[j - 1] and s2[j - 1] == s3[i + j - 1])", correct: false },
    { code: "dp[j] = (dp[j - 1] and s1[i - 1] == s3[i + j - 1]) or (dp[j] and s2[j - 1] == s3[i + j - 1])", correct: false },
  ],

  // 72 – Edit Distance
  '72': [
    { code: 'dp[j] = 1 + min(prev, dp[j], dp[j - 1])', correct: true },
    { code: 'dp[j] = min(prev, dp[j], dp[j - 1])', correct: false },
    { code: 'dp[j] = 1 + min(prev, dp[j])', correct: false },
    { code: 'dp[j] = 1 + max(prev, dp[j], dp[j - 1])', correct: false },
  ],

  // 123 – Best Time to Buy and Sell Stock III
  '123': [
    { code: 'buy2 = min(buy2, p - profit1)', correct: true },
    { code: 'buy2 = min(buy2, p + profit1)', correct: false },
    { code: 'buy2 = min(buy2, p - profit2)', correct: false },
    { code: 'buy2 = min(buy2, p)', correct: false },
  ],

  // 188 – Best Time to Buy and Sell Stock IV
  '188': [
    { code: 'max_diff = max(max_diff, dp[t - 1][d] - prices[d])', correct: true },
    { code: 'max_diff = max(max_diff, dp[t][d] - prices[d])', correct: false },
    { code: 'max_diff = max(max_diff, dp[t - 1][d] + prices[d])', correct: false },
    { code: 'max_diff = max(max_diff, dp[t - 1][d - 1] - prices[d])', correct: false },
  ],

  // 221 – Maximal Square
  '221': [
    { code: 'dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1', correct: true },
    { code: 'dp[i][j] = max(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1', correct: false },
    { code: 'dp[i][j] = min(dp[i-1][j], dp[i][j-1]) + 1', correct: false },
    { code: 'dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])', correct: false },
  ],
}
