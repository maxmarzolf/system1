import type { Flashcard } from './flashcards'

export const top150Flashcards: Flashcard[] = [
  // ===== ARRAY / STRING =====
  {
    id: '88',
    title: 'Merge Sorted Array',
    difficulty: 'Easy',
    prompt: 'You are given two integer arrays nums1 and nums2, sorted in non-decreasing order, and two integers m and n representing the number of elements in nums1 and nums2. Merge nums2 into nums1 as one sorted array in-place.',
    solution: `def merge(nums1, m, nums2, n):
    i, j, k = m - 1, n - 1, m + n - 1
    while i >= 0 and j >= 0:
        if nums1[i] > nums2[j]:
            nums1[k] = nums1[i]
            i -= 1
        else:
            {{missing}}
            j -= 1
        k -= 1
    while j >= 0:
        nums1[k] = nums2[j]
        j -= 1
        k -= 1`,
    missing: 'nums1[k] = nums2[j]',
    hint: 'Fill from the end of nums1 working backward, comparing the largest remaining elements.',
    tags: ['top150', 'array'],
  },
  {
    id: '27',
    title: 'Remove Element',
    difficulty: 'Easy',
    prompt: 'Given an integer array nums and an integer val, remove all occurrences of val in-place. Return the number of elements not equal to val.',
    solution: `def removeElement(nums, val):
    k = 0
    for i in range(len(nums)):
        if nums[i] != val:
            {{missing}}
            k += 1
    return k`,
    missing: 'nums[k] = nums[i]',
    hint: 'Use a write pointer to overwrite unwanted values.',
    tags: ['top150', 'array'],
  },
  {
    id: '26',
    title: 'Remove Duplicates from Sorted Array',
    difficulty: 'Easy',
    prompt: 'Given a sorted array nums, remove the duplicates in-place such that each element appears only once. Return the new length.',
    solution: `def removeDuplicates(nums):
    if not nums:
        return 0
    k = 1
    for i in range(1, len(nums)):
        if nums[i] != nums[i - 1]:
            {{missing}}
            k += 1
    return k`,
    missing: 'nums[k] = nums[i]',
    hint: 'Compare each element with the previous; write only when different.',
    tags: ['top150', 'array'],
  },
  {
    id: '80',
    title: 'Remove Duplicates from Sorted Array II',
    difficulty: 'Med.',
    prompt: 'Given a sorted array nums, remove duplicates in-place such that each element appears at most twice. Return the new length.',
    solution: `def removeDuplicates(nums):
    k = 0
    for x in nums:
        {{missing}}
            nums[k] = x
            k += 1
    return k`,
    missing: 'if k < 2 or x != nums[k - 2]:',
    hint: 'Allow at most two of the same value by checking against the element two positions back.',
    tags: ['top150', 'array'],
  },
  {
    id: '169',
    title: 'Majority Element',
    difficulty: 'Easy',
    prompt: 'Given an array nums of size n, return the majority element (appears more than n/2 times). You may assume the majority element always exists.',
    solution: `def majorityElement(nums):
    count = 0
    candidate = None
    for num in nums:
        if count == 0:
            {{missing}}
        count += 1 if num == candidate else -1
    return candidate`,
    missing: 'candidate = num',
    hint: 'Boyer-Moore voting: when count drops to 0, pick a new candidate.',
    tags: ['top150', 'array'],
  },
  {
    id: '189',
    title: 'Rotate Array',
    difficulty: 'Med.',
    prompt: 'Given an integer array nums, rotate the array to the right by k steps.',
    solution: `def rotate(nums, k):
    def reverse(l, r):
        while l < r:
            nums[l], nums[r] = nums[r], nums[l]
            l += 1
            r -= 1
    n = len(nums)
    k %= n
    {{missing}}
    reverse(0, k - 1)
    reverse(k, n - 1)`,
    missing: 'reverse(0, n - 1)',
    hint: 'Reverse the whole array first, then reverse the two halves.',
    tags: ['top150', 'array'],
  },
  {
    id: '121',
    title: 'Best Time to Buy and Sell Stock',
    difficulty: 'Easy',
    prompt: 'Given an array prices where prices[i] is the price on the ith day, find the maximum profit from one transaction (buy then sell).',
    solution: `def maxProfit(prices):
    min_price = float('inf')
    max_profit = 0
    for price in prices:
        {{missing}}
        max_profit = max(max_profit, price - min_price)
    return max_profit`,
    missing: "min_price = min(min_price, price)",
    hint: 'Track the minimum price seen so far and the best profit at each step.',
    tags: ['top150', 'array'],
  },
  {
    id: '122',
    title: 'Best Time to Buy and Sell Stock II',
    difficulty: 'Med.',
    prompt: 'Given an array prices, find the maximum profit. You may buy and sell multiple times but must sell before buying again.',
    solution: `def maxProfit(prices):
    profit = 0
    for i in range(1, len(prices)):
        {{missing}}
    return profit`,
    missing: 'profit += max(0, prices[i] - prices[i - 1])',
    hint: 'Collect every upward price movement — add the gain whenever today is higher than yesterday.',
    tags: ['top150', 'array'],
  },
  {
    id: '55',
    title: 'Jump Game',
    difficulty: 'Med.',
    prompt: 'Given an integer array nums where nums[i] is the max jump length from position i, determine if you can reach the last index.',
    solution: `def canJump(nums):
    farthest = 0
    for i in range(len(nums)):
        if i > farthest:
            return False
        {{missing}}
    return True`,
    missing: 'farthest = max(farthest, i + nums[i])',
    hint: 'Greedily track the farthest index reachable.',
    tags: ['top150', 'array'],
  },
  {
    id: '45',
    title: 'Jump Game II',
    difficulty: 'Med.',
    prompt: 'Given an integer array nums, return the minimum number of jumps to reach the last index. You can always reach the last index.',
    solution: `def jump(nums):
    jumps = 0
    cur_end = 0
    farthest = 0
    for i in range(len(nums) - 1):
        farthest = max(farthest, i + nums[i])
        if i == cur_end:
            jumps += 1
            {{missing}}
    return jumps`,
    missing: 'cur_end = farthest',
    hint: 'BFS-style: when you reach the end of the current level, jump to the farthest reachable.',
    tags: ['top150', 'array'],
  },
  {
    id: '274',
    title: 'H-Index',
    difficulty: 'Med.',
    prompt: 'Given an array of citation counts, return the researcher\'s h-index (the maximum h such that h papers have at least h citations).',
    solution: `def hIndex(citations):
    citations.sort(reverse=True)
    h = 0
    for i, c in enumerate(citations):
        {{missing}}
            h = i + 1
        else:
            break
    return h`,
    missing: 'if c >= i + 1:',
    hint: 'Sort descending and find the last position where the citation count >= rank.',
    tags: ['top150', 'array'],
  },
  {
    id: '380',
    title: 'Insert Delete GetRandom O(1)',
    difficulty: 'Med.',
    prompt: 'Implement a RandomizedSet class that supports insert, remove, and getRandom in average O(1) time.',
    solution: `import random

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
        {{missing}}
        self.vals.pop()
        del self.idx[val]
        return True

    def getRandom(self):
        return random.choice(self.vals)`,
    missing: 'self.idx[last] = i',
    hint: 'Swap the element to remove with the last element and update the index map.',
    tags: ['top150', 'array'],
  },
  {
    id: '238',
    title: 'Product of Array Except Self',
    difficulty: 'Med.',
    prompt: 'Given an integer array nums, return an array answer where answer[i] is the product of all elements except nums[i], without using division.',
    solution: `def productExceptSelf(nums):
    n = len(nums)
    answer = [1] * n
    prefix = 1
    for i in range(n):
        answer[i] = prefix
        prefix *= nums[i]
    suffix = 1
    for i in range(n - 1, -1, -1):
        {{missing}}
        suffix *= nums[i]
    return answer`,
    missing: 'answer[i] *= suffix',
    hint: 'Two passes: build prefix products left-to-right, then multiply by suffix products right-to-left.',
    tags: ['top150', 'array'],
  },
  {
    id: '134',
    title: 'Gas Station',
    difficulty: 'Med.',
    prompt: 'There are n gas stations in a circle. Given gas[i] and cost[i], return the starting station index for a complete circuit, or -1 if impossible.',
    solution: `def canCompleteCircuit(gas, cost):
    if sum(gas) < sum(cost):
        return -1
    start = 0
    tank = 0
    for i in range(len(gas)):
        tank += gas[i] - cost[i]
        if tank < 0:
            {{missing}}
            tank = 0
    return start`,
    missing: 'start = i + 1',
    hint: 'If tank goes negative, the answer must start after the current station.',
    tags: ['top150', 'array'],
  },
  {
    id: '135',
    title: 'Candy',
    difficulty: 'Hard',
    prompt: 'Each child has a rating. Give each child at least 1 candy. Children with higher ratings than neighbors must get more candy. Return the minimum total.',
    solution: `def candy(ratings):
    n = len(ratings)
    candies = [1] * n
    for i in range(1, n):
        if ratings[i] > ratings[i - 1]:
            candies[i] = candies[i - 1] + 1
    for i in range(n - 2, -1, -1):
        if ratings[i] > ratings[i + 1]:
            {{missing}}
    return sum(candies)`,
    missing: 'candies[i] = max(candies[i], candies[i + 1] + 1)',
    hint: 'Two passes: left-to-right for left neighbors, right-to-left for right neighbors, taking the max.',
    tags: ['top150', 'array'],
  },
  {
    id: '42',
    title: 'Trapping Rain Water',
    difficulty: 'Hard',
    prompt: 'Given n non-negative integers representing an elevation map, compute how much water it can trap after raining.',
    solution: `def trap(height):
    l, r = 0, len(height) - 1
    l_max = r_max = 0
    water = 0
    while l < r:
        if height[l] < height[r]:
            l_max = max(l_max, height[l])
            {{missing}}
            l += 1
        else:
            r_max = max(r_max, height[r])
            water += r_max - height[r]
            r -= 1
    return water`,
    missing: 'water += l_max - height[l]',
    hint: 'Use two pointers. Water at each position = min(left_max, right_max) - height.',
    tags: ['top150', 'array'],
  },
  {
    id: '13',
    title: 'Roman to Integer',
    difficulty: 'Easy',
    prompt: 'Given a roman numeral string, convert it to an integer.',
    solution: `def romanToInt(s):
    m = {'I': 1, 'V': 5, 'X': 10, 'L': 50,
         'C': 100, 'D': 500, 'M': 1000}
    result = 0
    for i in range(len(s)):
        if i + 1 < len(s) and m[s[i]] < m[s[i + 1]]:
            {{missing}}
        else:
            result += m[s[i]]
    return result`,
    missing: 'result -= m[s[i]]',
    hint: 'If a smaller value appears before a larger one, subtract it instead of adding.',
    tags: ['top150', 'array'],
  },
  {
    id: '12',
    title: 'Integer to Roman',
    difficulty: 'Med.',
    prompt: 'Given an integer, convert it to a roman numeral string.',
    solution: `def intToRoman(num):
    pairs = [
        (1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'),
        (100, 'C'), (90, 'XC'), (50, 'L'), (40, 'XL'),
        (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')
    ]
    result = []
    for val, sym in pairs:
        while num >= val:
            {{missing}}
            num -= val
    return ''.join(result)`,
    missing: "result.append(sym)",
    hint: 'Greedily subtract the largest possible roman value and append its symbol.',
    tags: ['top150', 'array'],
  },
  {
    id: '58',
    title: 'Length of Last Word',
    difficulty: 'Easy',
    prompt: 'Given a string s consisting of words and spaces, return the length of the last word.',
    solution: `def lengthOfLastWord(s):
    {{missing}}
    return len(s.split()[-1])`,
    missing: "s = s.strip()",
    hint: 'Strip trailing spaces, then find the last word.',
    tags: ['top150', 'array'],
  },
  {
    id: '14',
    title: 'Longest Common Prefix',
    difficulty: 'Easy',
    prompt: 'Write a function to find the longest common prefix among an array of strings.',
    solution: `def longestCommonPrefix(strs):
    if not strs:
        return ""
    prefix = strs[0]
    for s in strs[1:]:
        while not s.startswith(prefix):
            {{missing}}
            if not prefix:
                return ""
    return prefix`,
    missing: 'prefix = prefix[:-1]',
    hint: 'Shrink the prefix by removing its last character until every string starts with it.',
    tags: ['top150', 'array'],
  },
  {
    id: '151',
    title: 'Reverse Words in a String',
    difficulty: 'Med.',
    prompt: 'Given a string s, reverse the order of words. Words are separated by spaces; the result should have single spaces and no leading/trailing spaces.',
    solution: `def reverseWords(s):
    {{missing}}
    return ' '.join(words)`,
    missing: "words = s.split()[::-1]",
    hint: 'Split on whitespace, reverse the list of words, then join with single spaces.',
    tags: ['top150', 'array'],
  },
  {
    id: '6',
    title: 'Zigzag Conversion',
    difficulty: 'Med.',
    prompt: 'Write the string in a zigzag pattern on numRows rows, then read line by line.',
    solution: `def convert(s, numRows):
    if numRows == 1:
        return s
    rows = [''] * numRows
    cur_row = 0
    going_down = False
    for c in s:
        rows[cur_row] += c
        if cur_row == 0 or cur_row == numRows - 1:
            {{missing}}
        cur_row += 1 if going_down else -1
    return ''.join(rows)`,
    missing: 'going_down = not going_down',
    hint: 'Reverse direction when you hit the top or bottom row.',
    tags: ['top150', 'array'],
  },
  {
    id: '28',
    title: 'Find the Index of the First Occurrence in a String',
    difficulty: 'Easy',
    prompt: 'Given two strings haystack and needle, return the index of the first occurrence of needle in haystack, or -1.',
    solution: `def strStr(haystack, needle):
    {{missing}}`,
    missing: "return haystack.find(needle)",
    hint: 'Python\'s str.find() returns -1 when the substring is not found.',
    tags: ['top150', 'array'],
  },
  {
    id: '68',
    title: 'Text Justification',
    difficulty: 'Hard',
    prompt: 'Given an array of words and a maxWidth, format the text so each line has exactly maxWidth characters, fully justified.',
    solution: `def fullJustify(words, maxWidth):
    res, line, width = [], [], 0
    for w in words:
        if width + len(w) + len(line) > maxWidth:
            for i in range(maxWidth - width):
                {{missing}}
            res.append(''.join(line))
            line, width = [], 0
        line.append(w)
        width += len(w)
    res.append(' '.join(line).ljust(maxWidth))
    return res`,
    missing: "line[i % (len(line) - 1 or 1)] += ' '",
    hint: 'Distribute extra spaces round-robin between words in the current line.',
    tags: ['top150', 'array'],
  },

  // ===== TWO POINTERS =====
  {
    id: '125',
    title: 'Valid Palindrome',
    difficulty: 'Easy',
    prompt: 'Given a string s, return true if it is a palindrome considering only alphanumeric characters and ignoring case.',
    solution: `def isPalindrome(s):
    l, r = 0, len(s) - 1
    while l < r:
        while l < r and not s[l].isalnum():
            l += 1
        while l < r and not s[r].isalnum():
            r -= 1
        {{missing}}
            return False
        l += 1
        r -= 1
    return True`,
    missing: "if s[l].lower() != s[r].lower():",
    hint: 'Skip non-alphanumeric characters and compare case-insensitively.',
    tags: ['top150', 'two-pointers'],
  },
  {
    id: '392',
    title: 'Is Subsequence',
    difficulty: 'Easy',
    prompt: 'Given two strings s and t, return true if s is a subsequence of t.',
    solution: `def isSubsequence(s, t):
    i = 0
    for c in t:
        if i < len(s) and c == s[i]:
            {{missing}}
    return i == len(s)`,
    missing: 'i += 1',
    hint: 'Walk through t; advance the pointer in s whenever characters match.',
    tags: ['top150', 'two-pointers'],
  },
  {
    id: '167',
    title: 'Two Sum II',
    difficulty: 'Med.',
    prompt: 'Given a 1-indexed sorted array, find two numbers that add up to target. Return their 1-indexed positions.',
    solution: `def twoSum(numbers, target):
    l, r = 0, len(numbers) - 1
    while l < r:
        s = numbers[l] + numbers[r]
        if s == target:
            return [l + 1, r + 1]
        elif s < target:
            l += 1
        else:
            {{missing}}`,
    missing: 'r -= 1',
    hint: 'If the sum is too large, move the right pointer left.',
    tags: ['top150', 'two-pointers'],
  },
  {
    id: '11',
    title: 'Container With Most Water',
    difficulty: 'Med.',
    prompt: 'Given n vertical lines, find two that together with the x-axis form a container holding the most water.',
    solution: `def maxArea(height):
    l, r = 0, len(height) - 1
    ans = 0
    while l < r:
        ans = max(ans, min(height[l], height[r]) * (r - l))
        {{missing}}
            l += 1
        else:
            r -= 1
    return ans`,
    missing: 'if height[l] < height[r]:',
    hint: 'Move the pointer with the shorter line inward to potentially find a taller line.',
    tags: ['top150', 'two-pointers'],
  },
  {
    id: '15',
    title: '3Sum',
    difficulty: 'Med.',
    prompt: 'Given an integer array nums, return all unique triplets [a, b, c] such that a + b + c = 0.',
    solution: `def threeSum(nums):
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
                {{missing}}
                while l < r and nums[l] == nums[l - 1]:
                    l += 1
    return res`,
    missing: 'l += 1; r -= 1',
    hint: 'When a triplet is found, move both pointers and skip duplicates.',
    tags: ['top150', 'two-pointers'],
  },

  // ===== SLIDING WINDOW =====
  {
    id: '209',
    title: 'Minimum Size Subarray Sum',
    difficulty: 'Med.',
    prompt: 'Given an array of positive integers and a target, return the minimal length of a subarray whose sum >= target, or 0.',
    solution: `def minSubArrayLen(target, nums):
    l = 0
    total = 0
    ans = float('inf')
    for r in range(len(nums)):
        total += nums[r]
        while total >= target:
            {{missing}}
            total -= nums[l]
            l += 1
    return ans if ans != float('inf') else 0`,
    missing: 'ans = min(ans, r - l + 1)',
    hint: 'Shrink the window from the left while the sum is still >= target and track the minimum length.',
    tags: ['top150', 'sliding-window'],
  },
  {
    id: '3',
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'Med.',
    prompt: 'Given a string s, find the length of the longest substring without repeating characters.',
    solution: `def lengthOfLongestSubstring(s):
    seen = {}
    l = 0
    ans = 0
    for r, c in enumerate(s):
        if c in seen and seen[c] >= l:
            l = seen[c] + 1
        {{missing}}
        ans = max(ans, r - l + 1)
    return ans`,
    missing: 'seen[c] = r',
    hint: 'Track the last index of each character; jump the left pointer past duplicates.',
    tags: ['top150', 'sliding-window'],
  },
  {
    id: '30',
    title: 'Substring with Concatenation of All Words',
    difficulty: 'Hard',
    prompt: 'Given a string s and an array of equal-length words, find all starting indices of substrings that are a concatenation of all words in any order.',
    solution: `from collections import Counter

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
                {{missing}}
                    res.append(l)
            else:
                cur.clear()
                count = 0
                l = r + w_len
    return res`,
    missing: 'if count == len(words):',
    hint: 'Slide a window of word-length steps; when the word count matches, record the start index.',
    tags: ['top150', 'sliding-window'],
  },
  {
    id: '76',
    title: 'Minimum Window Substring',
    difficulty: 'Hard',
    prompt: 'Given strings s and t, return the minimum window substring of s that contains all characters of t.',
    solution: `from collections import Counter

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
            {{missing}}
            l += 1
    return s[start:end + 1] if end != float('inf') else ""`,
    missing: 'if need[s[l]] > 0: missing += 1',
    hint: 'Expand right until all chars are covered, then shrink left to minimize the window.',
    tags: ['top150', 'sliding-window'],
  },

  // ===== MATRIX =====
  {
    id: '36',
    title: 'Valid Sudoku',
    difficulty: 'Med.',
    prompt: 'Determine if a 9x9 Sudoku board is valid. Only filled cells need to be validated.',
    solution: `def isValidSudoku(board):
    rows = [set() for _ in range(9)]
    cols = [set() for _ in range(9)]
    boxes = [set() for _ in range(9)]
    for i in range(9):
        for j in range(9):
            num = board[i][j]
            if num == '.':
                continue
            {{missing}}
            if num in rows[i] or num in cols[j] or num in boxes[box]:
                return False
            rows[i].add(num)
            cols[j].add(num)
            boxes[box].add(num)
    return True`,
    missing: 'box = (i // 3) * 3 + j // 3',
    hint: 'Map each cell to its 3x3 box index using integer division.',
    tags: ['top150', 'matrix'],
  },
  {
    id: '54',
    title: 'Spiral Matrix',
    difficulty: 'Med.',
    prompt: 'Given an m x n matrix, return all elements in spiral order.',
    solution: `def spiralOrder(matrix):
    res = []
    while matrix:
        {{missing}}
        matrix = list(zip(*matrix))[::-1]
    return res`,
    missing: 'res += matrix.pop(0)',
    hint: 'Take the first row, then rotate the remaining matrix counter-clockwise and repeat.',
    tags: ['top150', 'matrix'],
  },
  {
    id: '48',
    title: 'Rotate Image',
    difficulty: 'Med.',
    prompt: 'Rotate an n x n 2D matrix 90 degrees clockwise in-place.',
    solution: `def rotate(matrix):
    n = len(matrix)
    for i in range(n):
        for j in range(i + 1, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
    for row in matrix:
        {{missing}}`,
    missing: 'row.reverse()',
    hint: 'Transpose the matrix, then reverse each row.',
    tags: ['top150', 'matrix'],
  },
  {
    id: '73',
    title: 'Set Matrix Zeroes',
    difficulty: 'Med.',
    prompt: 'If an element is 0, set its entire row and column to 0. Do it in-place.',
    solution: `def setZeroes(matrix):
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
            {{missing}}
                matrix[i][j] = 0
    if first_row:
        for j in range(n):
            matrix[0][j] = 0
    if first_col:
        for i in range(m):
            matrix[i][0] = 0`,
    missing: 'if matrix[i][0] == 0 or matrix[0][j] == 0:',
    hint: 'Use the first row and column as markers for which rows/columns to zero out.',
    tags: ['top150', 'matrix'],
  },
  {
    id: '289',
    title: 'Game of Life',
    difficulty: 'Med.',
    prompt: 'Implement Conway\'s Game of Life. Update the board in-place simultaneously.',
    solution: `def gameOfLife(board):
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
                {{missing}}
    for i in range(m):
        for j in range(n):
            board[i][j] = 1 if board[i][j] > 0 else 0`,
    missing: 'board[i][j] = 2',
    hint: 'Use extra states (e.g. 2 for dead->live, -1 for live->dead) to encode transitions in-place.',
    tags: ['top150', 'matrix'],
  },

  // ===== HASHMAP =====
  {
    id: '383',
    title: 'Ransom Note',
    difficulty: 'Easy',
    prompt: 'Given two strings ransomNote and magazine, return true if ransomNote can be constructed from the letters of magazine.',
    solution: `from collections import Counter

def canConstruct(ransomNote, magazine):
    {{missing}}`,
    missing: "return not (Counter(ransomNote) - Counter(magazine))",
    hint: 'A Counter subtraction removes letters available in the magazine; if nothing remains, it works.',
    tags: ['top150', 'hashmap'],
  },
  {
    id: '205',
    title: 'Isomorphic Strings',
    difficulty: 'Easy',
    prompt: 'Given two strings s and t, determine if they are isomorphic (characters can be mapped one-to-one).',
    solution: `def isIsomorphic(s, t):
    if len(s) != len(t):
        return False
    s_map, t_map = {}, {}
    for a, b in zip(s, t):
        if s_map.get(a, b) != b or t_map.get(b, a) != a:
            return False
        {{missing}}
        t_map[b] = a
    return True`,
    missing: 's_map[a] = b',
    hint: 'Maintain two-way mappings and verify consistency at each character pair.',
    tags: ['top150', 'hashmap'],
  },
  {
    id: '290',
    title: 'Word Pattern',
    difficulty: 'Easy',
    prompt: 'Given a pattern and a string s, determine if s follows the same pattern (bijection between letters and words).',
    solution: `def wordPattern(pattern, s):
    words = s.split()
    if len(pattern) != len(words):
        return False
    {{missing}}`,
    missing: "return len(set(zip(pattern, words))) == len(set(pattern)) == len(set(words))",
    hint: 'The number of unique pairs must equal the number of unique pattern chars and unique words.',
    tags: ['top150', 'hashmap'],
  },
  {
    id: '242',
    title: 'Valid Anagram',
    difficulty: 'Easy',
    prompt: 'Given two strings s and t, return true if t is an anagram of s.',
    solution: `from collections import Counter

def isAnagram(s, t):
    {{missing}}`,
    missing: 'return Counter(s) == Counter(t)',
    hint: 'Two strings are anagrams if they have the same character frequency counts.',
    tags: ['top150', 'hashmap'],
  },
  {
    id: '49',
    title: 'Group Anagrams',
    difficulty: 'Med.',
    prompt: 'Given an array of strings, group the anagrams together.',
    solution: `from collections import defaultdict

def groupAnagrams(strs):
    groups = defaultdict(list)
    for s in strs:
        {{missing}}
    return list(groups.values())`,
    missing: "groups[tuple(sorted(s))].append(s)",
    hint: 'Use the sorted characters as a key to group anagrams together.',
    tags: ['top150', 'hashmap'],
  },
  {
    id: '1',
    title: 'Two Sum',
    difficulty: 'Easy',
    prompt: 'Given an array of integers and a target, return the indices of the two numbers that add up to target.',
    solution: `def twoSum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        {{missing}}`,
    missing: 'seen[num] = i',
    hint: 'Store each number\'s index in a hash map; check for the complement each step.',
    tags: ['top150', 'hashmap'],
  },
  {
    id: '202',
    title: 'Happy Number',
    difficulty: 'Easy',
    prompt: 'Determine if a number is "happy": repeatedly replace it with the sum of the squares of its digits until it equals 1 or loops forever.',
    solution: `def isHappy(n):
    seen = set()
    while n != 1:
        {{missing}}
        n = sum(int(d) ** 2 for d in str(n))
        if n in seen:
            return False
    return True`,
    missing: 'seen.add(n)',
    hint: 'Detect a cycle by tracking numbers you\'ve already seen.',
    tags: ['top150', 'hashmap'],
  },
  {
    id: '219',
    title: 'Contains Duplicate II',
    difficulty: 'Easy',
    prompt: 'Given an array nums and integer k, return true if there are two distinct indices i and j such that nums[i] == nums[j] and abs(i - j) <= k.',
    solution: `def containsNearbyDuplicate(nums, k):
    seen = {}
    for i, num in enumerate(nums):
        {{missing}}
            return True
        seen[num] = i
    return False`,
    missing: 'if num in seen and i - seen[num] <= k:',
    hint: 'Track the last index of each value and check if it\'s within k.',
    tags: ['top150', 'hashmap'],
  },
  {
    id: '128',
    title: 'Longest Consecutive Sequence',
    difficulty: 'Med.',
    prompt: 'Given an unsorted array of integers, find the length of the longest consecutive elements sequence in O(n) time.',
    solution: `def longestConsecutive(nums):
    num_set = set(nums)
    longest = 0
    for n in num_set:
        {{missing}}
            length = 1
            while n + length in num_set:
                length += 1
            longest = max(longest, length)
    return longest`,
    missing: 'if n - 1 not in num_set:',
    hint: 'Only start counting from the beginning of a sequence (where n-1 is absent).',
    tags: ['top150', 'hashmap'],
  },

  // ===== INTERVALS =====
  {
    id: '228',
    title: 'Summary Ranges',
    difficulty: 'Easy',
    prompt: 'Given a sorted unique integer array, return the smallest sorted list of ranges that cover all the numbers.',
    solution: `def summaryRanges(nums):
    res = []
    i = 0
    while i < len(nums):
        start = nums[i]
        while i + 1 < len(nums) and nums[i + 1] == nums[i] + 1:
            i += 1
        {{missing}}
        i += 1
    return res`,
    missing: "res.append(str(start) if start == nums[i] else f'{start}->{nums[i]}')",
    hint: 'Extend the range while consecutive, then format as "a" or "a->b".',
    tags: ['top150', 'intervals'],
  },
  {
    id: '56',
    title: 'Merge Intervals',
    difficulty: 'Med.',
    prompt: 'Given an array of intervals, merge all overlapping intervals.',
    solution: `def merge(intervals):
    intervals.sort()
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            {{missing}}
        else:
            merged.append([start, end])
    return merged`,
    missing: 'merged[-1][1] = max(merged[-1][1], end)',
    hint: 'Sort by start time; if the current interval overlaps the last merged one, extend the end.',
    tags: ['top150', 'intervals'],
  },
  {
    id: '57',
    title: 'Insert Interval',
    difficulty: 'Med.',
    prompt: 'Insert a new interval into a sorted non-overlapping list of intervals, merging if necessary.',
    solution: `def insert(intervals, newInterval):
    res = []
    for i, (s, e) in enumerate(intervals):
        if e < newInterval[0]:
            res.append([s, e])
        elif s > newInterval[1]:
            res.append(newInterval)
            return res + intervals[i:]
        else:
            {{missing}}
    res.append(newInterval)
    return res`,
    missing: 'newInterval = [min(s, newInterval[0]), max(e, newInterval[1])]',
    hint: 'Merge overlapping intervals into newInterval by expanding its bounds.',
    tags: ['top150', 'intervals'],
  },
  {
    id: '452',
    title: 'Minimum Number of Arrows to Burst Balloons',
    difficulty: 'Med.',
    prompt: 'Given balloons as intervals on the x-axis, find the minimum number of arrows (vertical lines) to burst all balloons.',
    solution: `def findMinArrowShots(points):
    points.sort(key=lambda x: x[1])
    arrows = 1
    end = points[0][1]
    for s, e in points[1:]:
        if s > end:
            arrows += 1
            {{missing}}
    return arrows`,
    missing: 'end = e',
    hint: 'Sort by end point; shoot at the earliest end. Start a new arrow only when a balloon starts after the current arrow.',
    tags: ['top150', 'intervals'],
  },

  // ===== STACK =====
  {
    id: '71',
    title: 'Simplify Path',
    difficulty: 'Med.',
    prompt: 'Given an absolute Unix file path, simplify it to its canonical form.',
    solution: `def simplifyPath(path):
    stack = []
    for part in path.split('/'):
        if part == '..':
            if stack:
                stack.pop()
        elif part and part != '.':
            {{missing}}
    return '/' + '/'.join(stack)`,
    missing: 'stack.append(part)',
    hint: 'Split by "/", push valid directory names, pop on "..", skip "." and empty parts.',
    tags: ['top150', 'stack'],
  },
  {
    id: '150',
    title: 'Evaluate Reverse Polish Notation',
    difficulty: 'Med.',
    prompt: 'Evaluate an arithmetic expression in Reverse Polish Notation (postfix).',
    solution: `def evalRPN(tokens):
    stack = []
    for t in tokens:
        if t in '+-*/':
            b, a = stack.pop(), stack.pop()
            if t == '+': stack.append(a + b)
            elif t == '-': stack.append(a - b)
            elif t == '*': stack.append(a * b)
            else: stack.append(int(a / b))
        else:
            {{missing}}
    return stack[0]`,
    missing: 'stack.append(int(t))',
    hint: 'Push numbers; when you see an operator, pop two operands and push the result.',
    tags: ['top150', 'stack'],
  },
  {
    id: '224',
    title: 'Basic Calculator',
    difficulty: 'Hard',
    prompt: 'Implement a basic calculator to evaluate a string expression with +, -, and parentheses.',
    solution: `def calculate(s):
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
            {{missing}}
            result = stack.pop() + result
            num = 0
    return result + sign * num`,
    missing: 'result *= stack.pop()',
    hint: 'On "(" push result and sign onto the stack. On ")" apply the saved sign and add to the saved result.',
    tags: ['top150', 'stack'],
  },

  // ===== LINKED LIST =====
  {
    id: '141',
    title: 'Linked List Cycle',
    difficulty: 'Easy',
    prompt: 'Given head of a linked list, determine if the list has a cycle.',
    solution: `def hasCycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        {{missing}}
        if slow == fast:
            return True
    return False`,
    missing: 'fast = fast.next.next',
    hint: 'Use Floyd\'s cycle detection: the fast pointer moves two steps at a time.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '2',
    title: 'Add Two Numbers',
    difficulty: 'Med.',
    prompt: 'Two non-empty linked lists represent non-negative integers in reverse order. Return their sum as a linked list.',
    solution: `def addTwoNumbers(l1, l2):
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
        {{missing}}
        cur.next = ListNode(val % 10)
        cur = cur.next
    return dummy.next`,
    missing: 'carry = val // 10',
    hint: 'Process digits from least significant; carry forward values >= 10.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '21',
    title: 'Merge Two Sorted Lists',
    difficulty: 'Easy',
    prompt: 'Merge two sorted linked lists into one sorted list.',
    solution: `def mergeTwoLists(l1, l2):
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
    {{missing}}
    return dummy.next`,
    missing: 'cur.next = l1 or l2',
    hint: 'After the loop, attach whichever list still has remaining nodes.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '138',
    title: 'Copy List with Random Pointer',
    difficulty: 'Med.',
    prompt: 'Deep copy a linked list where each node has a next pointer and a random pointer.',
    solution: `def copyRandomList(head):
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
        {{missing}}
        cur = cur.next
    return old_to_new[head]`,
    missing: 'old_to_new[cur].random = old_to_new.get(cur.random)',
    hint: 'First pass: create clones. Second pass: wire next and random using a hash map.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '92',
    title: 'Reverse Linked List II',
    difficulty: 'Med.',
    prompt: 'Reverse the nodes of a linked list from position left to position right.',
    solution: `def reverseBetween(head, left, right):
    dummy = ListNode(0, head)
    prev = dummy
    for _ in range(left - 1):
        prev = prev.next
    cur = prev.next
    for _ in range(right - left):
        temp = cur.next
        {{missing}}
        prev.next = temp
    return dummy.next`,
    missing: 'cur.next = temp.next; temp.next = prev.next',
    hint: 'Repeatedly move the node after cur to the front of the reversed section.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '25',
    title: 'Reverse Nodes in k-Group',
    difficulty: 'Hard',
    prompt: 'Reverse every k consecutive nodes in a linked list. If remaining nodes < k, leave them as is.',
    solution: `def reverseKGroup(head, k):
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
            {{missing}}
            prev = cur
            cur = nxt
        prev_group.next = kth if kth else prev
        prev_group = head
        head = next_group`,
    missing: 'nxt = cur.next; cur.next = prev',
    hint: 'Reverse k nodes by flipping next pointers, then reconnect the group boundaries.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '19',
    title: 'Remove Nth Node From End of List',
    difficulty: 'Med.',
    prompt: 'Remove the nth node from the end of a linked list and return the head.',
    solution: `def removeNthFromEnd(head, n):
    dummy = ListNode(0, head)
    fast = slow = dummy
    for _ in range(n + 1):
        fast = fast.next
    while fast:
        fast = fast.next
        slow = slow.next
    {{missing}}
    return dummy.next`,
    missing: 'slow.next = slow.next.next',
    hint: 'Move fast n+1 steps ahead, then advance both; slow ends up just before the target.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '82',
    title: 'Remove Duplicates from Sorted List II',
    difficulty: 'Med.',
    prompt: 'Given the head of a sorted linked list, delete all nodes with duplicate numbers, leaving only distinct values.',
    solution: `def deleteDuplicates(head):
    dummy = ListNode(0, head)
    prev = dummy
    while head:
        if head.next and head.val == head.next.val:
            while head.next and head.val == head.next.val:
                head = head.next
            {{missing}}
        else:
            prev = prev.next
        head = head.next
    return dummy.next`,
    missing: 'prev.next = head.next',
    hint: 'Skip all duplicate nodes by advancing head past the duplicates, then relink prev.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '61',
    title: 'Rotate List',
    difficulty: 'Med.',
    prompt: 'Given a linked list, rotate the list to the right by k places.',
    solution: `def rotateRight(head, k):
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
    {{missing}}
    cur = head
    for _ in range(length - k - 1):
        cur = cur.next
    new_head = cur.next
    cur.next = None
    return new_head`,
    missing: 'tail.next = head',
    hint: 'Connect tail to head to form a circle, then break it at the right point.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '86',
    title: 'Partition List',
    difficulty: 'Med.',
    prompt: 'Given a linked list and a value x, partition it so all nodes < x come before nodes >= x, preserving order.',
    solution: `def partition(head, x):
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
    {{missing}}
    return before.next`,
    missing: 'b.next = after.next',
    hint: 'Build two separate lists (before and after), then connect them.',
    tags: ['top150', 'linked-list'],
  },
  {
    id: '146',
    title: 'LRU Cache',
    difficulty: 'Med.',
    prompt: 'Design a data structure for a Least Recently Used (LRU) cache with get and put in O(1).',
    solution: `from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        self.cache = OrderedDict()
        self.cap = capacity

    def get(self, key):
        if key not in self.cache:
            return -1
        {{missing}}
        return self.cache[key]

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.cap:
            self.cache.popitem(last=False)`,
    missing: 'self.cache.move_to_end(key)',
    hint: 'Use an OrderedDict; move accessed keys to the end to mark them as recently used.',
    tags: ['top150', 'linked-list'],
  },

  // ===== BINARY TREE =====
  {
    id: '105',
    title: 'Construct Binary Tree from Preorder and Inorder Traversal',
    difficulty: 'Med.',
    prompt: 'Given preorder and inorder traversal arrays, construct the binary tree.',
    solution: `def buildTree(preorder, inorder):
    if not preorder:
        return None
    root = TreeNode(preorder[0])
    {{missing}}
    root.left = buildTree(preorder[1:mid + 1], inorder[:mid])
    root.right = buildTree(preorder[mid + 1:], inorder[mid + 1:])
    return root`,
    missing: 'mid = inorder.index(preorder[0])',
    hint: 'The first element of preorder is the root. Find it in inorder to split left and right subtrees.',
    tags: ['top150', 'binary-tree'],
  },
  {
    id: '106',
    title: 'Construct Binary Tree from Inorder and Postorder Traversal',
    difficulty: 'Med.',
    prompt: 'Given inorder and postorder traversal arrays, construct the binary tree.',
    solution: `def buildTree(inorder, postorder):
    if not postorder:
        return None
    root = TreeNode(postorder[-1])
    {{missing}}
    root.left = buildTree(inorder[:mid], postorder[:mid])
    root.right = buildTree(inorder[mid + 1:], postorder[mid:-1])
    return root`,
    missing: 'mid = inorder.index(postorder[-1])',
    hint: 'The last element of postorder is the root. Find it in inorder to partition subtrees.',
    tags: ['top150', 'binary-tree'],
  },
  {
    id: '117',
    title: 'Populating Next Right Pointers in Each Node II',
    difficulty: 'Med.',
    prompt: 'Populate each node\'s next pointer to point to its next right node. If there is no next right node, set it to NULL.',
    solution: `def connect(root):
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
        {{missing}}
    return root`,
    missing: 'node = dummy.next',
    hint: 'Process level by level using the next pointers already set; use a dummy node to build the next level\'s chain.',
    tags: ['top150', 'binary-tree'],
  },
  {
    id: '114',
    title: 'Flatten Binary Tree to Linked List',
    difficulty: 'Med.',
    prompt: 'Flatten a binary tree to a linked list in-place using preorder traversal.',
    solution: `def flatten(root):
    cur = root
    while cur:
        if cur.left:
            prev = cur.left
            while prev.right:
                prev = prev.right
            {{missing}}
            cur.right = cur.left
            cur.left = None
        cur = cur.right`,
    missing: 'prev.right = cur.right',
    hint: 'Find the rightmost node of the left subtree and connect it to the current right subtree.',
    tags: ['top150', 'binary-tree'],
  },
  {
    id: '129',
    title: 'Sum Root to Leaf Numbers',
    difficulty: 'Med.',
    prompt: 'Each root-to-leaf path represents a number. Return the total sum of all root-to-leaf numbers.',
    solution: `def sumNumbers(root, cur=0):
    if not root:
        return 0
    {{missing}}
    if not root.left and not root.right:
        return cur
    return sumNumbers(root.left, cur) + sumNumbers(root.right, cur)`,
    missing: 'cur = cur * 10 + root.val',
    hint: 'Pass the running number down by multiplying by 10 and adding the current digit.',
    tags: ['top150', 'binary-tree'],
  },
  {
    id: '124',
    title: 'Binary Tree Maximum Path Sum',
    difficulty: 'Hard',
    prompt: 'Find the maximum path sum in a binary tree. A path can start and end at any node.',
    solution: `def maxPathSum(root):
    ans = [float('-inf')]
    def dfs(node):
        if not node:
            return 0
        left = max(dfs(node.left), 0)
        right = max(dfs(node.right), 0)
        {{missing}}
        return node.val + max(left, right)
    dfs(root)
    return ans[0]`,
    missing: 'ans[0] = max(ans[0], node.val + left + right)',
    hint: 'At each node, consider the path going through it (left + node + right) as a candidate max, but return only one side upward.',
    tags: ['top150', 'binary-tree'],
  },
  {
    id: '173',
    title: 'Binary Search Tree Iterator',
    difficulty: 'Med.',
    prompt: 'Implement an iterator over a BST with next() and hasNext() in O(h) space.',
    solution: `class BSTIterator:
    def __init__(self, root):
        self.stack = []
        self._push_left(root)

    def _push_left(self, node):
        while node:
            self.stack.append(node)
            node = node.left

    def next(self):
        node = self.stack.pop()
        {{missing}}
        return node.val

    def hasNext(self):
        return len(self.stack) > 0`,
    missing: 'self._push_left(node.right)',
    hint: 'After popping a node, push all its right child\'s left descendants onto the stack.',
    tags: ['top150', 'binary-tree'],
  },
  {
    id: '222',
    title: 'Count Complete Tree Nodes',
    difficulty: 'Easy',
    prompt: 'Count the number of nodes in a complete binary tree in less than O(n) time.',
    solution: `def countNodes(root):
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
    {{missing}}
        return 2 ** left_h - 1
    return 1 + countNodes(root.left) + countNodes(root.right)`,
    missing: 'if left_h == right_h:',
    hint: 'If left and right heights are equal, the tree is perfect (2^h - 1 nodes). Otherwise, recurse.',
    tags: ['top150', 'binary-tree'],
  },
  {
    id: '236',
    title: 'Lowest Common Ancestor of a Binary Tree',
    difficulty: 'Med.',
    prompt: 'Given a binary tree, find the lowest common ancestor (LCA) of two given nodes.',
    solution: `def lowestCommonAncestor(root, p, q):
    if not root or root == p or root == q:
        return root
    left = lowestCommonAncestor(root.left, p, q)
    right = lowestCommonAncestor(root.right, p, q)
    {{missing}}
    return left or right`,
    missing: 'if left and right: return root',
    hint: 'If both sides return a node, the current root is the LCA. Otherwise return the non-None side.',
    tags: ['top150', 'binary-tree'],
  },

  // ===== BINARY TREE BFS =====
  {
    id: '199',
    title: 'Binary Tree Right Side View',
    difficulty: 'Med.',
    prompt: 'Given the root of a binary tree, return the values of nodes visible from the right side.',
    solution: `from collections import deque

def rightSideView(root):
    if not root:
        return []
    res = []
    q = deque([root])
    while q:
        {{missing}}
        for _ in range(len(q)):
            node = q.popleft()
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
    return res`,
    missing: 'res.append(q[-1].val)',
    hint: 'BFS level by level; the rightmost node of each level is q[-1] before processing.',
    tags: ['top150', 'bfs'],
  },
  {
    id: '637',
    title: 'Average of Levels in Binary Tree',
    difficulty: 'Easy',
    prompt: 'Given the root of a binary tree, return the average value of nodes on each level.',
    solution: `from collections import deque

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
        {{missing}}
    return res`,
    missing: 'res.append(level_sum / size)',
    hint: 'Sum all node values in the level and divide by the level size.',
    tags: ['top150', 'bfs'],
  },
  {
    id: '102',
    title: 'Binary Tree Level Order Traversal',
    difficulty: 'Med.',
    prompt: 'Given the root of a binary tree, return the level order traversal as a list of lists.',
    solution: `from collections import deque

def levelOrder(root):
    if not root:
        return []
    res = []
    q = deque([root])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            {{missing}}
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        res.append(level)
    return res`,
    missing: 'level.append(node.val)',
    hint: 'Process one level at a time using a queue, collecting values into a list per level.',
    tags: ['top150', 'bfs'],
  },
  {
    id: '103',
    title: 'Binary Tree Zigzag Level Order Traversal',
    difficulty: 'Med.',
    prompt: 'Return the zigzag level order traversal of a binary tree (alternating left-to-right and right-to-left).',
    solution: `from collections import deque

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
        {{missing}}
        left_to_right = not left_to_right
    return res`,
    missing: 'res.append(level if left_to_right else level[::-1])',
    hint: 'Standard BFS but reverse every other level before appending.',
    tags: ['top150', 'bfs'],
  },

  // ===== BST =====
  {
    id: '230',
    title: 'Kth Smallest Element in a BST',
    difficulty: 'Med.',
    prompt: 'Given the root of a BST, return the kth smallest value.',
    solution: `def kthSmallest(root, k):
    stack = []
    cur = root
    while cur or stack:
        while cur:
            stack.append(cur)
            cur = cur.left
        cur = stack.pop()
        k -= 1
        {{missing}}
            return cur.val
        cur = cur.right`,
    missing: 'if k == 0:',
    hint: 'Inorder traversal of a BST yields sorted order. Pop the kth node.',
    tags: ['top150', 'bst'],
  },
  {
    id: '98',
    title: 'Validate Binary Search Tree',
    difficulty: 'Med.',
    prompt: 'Determine if a binary tree is a valid BST.',
    solution: `def isValidBST(root, lo=float('-inf'), hi=float('inf')):
    if not root:
        return True
    {{missing}}
        return False
    return isValidBST(root.left, lo, root.val) and isValidBST(root.right, root.val, hi)`,
    missing: 'if root.val <= lo or root.val >= hi:',
    hint: 'Pass valid value bounds down the tree; each node must be strictly within (lo, hi).',
    tags: ['top150', 'bst'],
  },

  // ===== GRAPH =====
  {
    id: '200',
    title: 'Number of Islands',
    difficulty: 'Med.',
    prompt: 'Given a 2D grid of "1"s (land) and "0"s (water), count the number of islands.',
    solution: `def numIslands(grid):
    def dfs(i, j):
        if i < 0 or i >= len(grid) or j < 0 or j >= len(grid[0]) or grid[i][j] != '1':
            return
        {{missing}}
        dfs(i + 1, j); dfs(i - 1, j); dfs(i, j + 1); dfs(i, j - 1)
    count = 0
    for i in range(len(grid)):
        for j in range(len(grid[0])):
            if grid[i][j] == '1':
                dfs(i, j)
                count += 1
    return count`,
    missing: "grid[i][j] = '0'",
    hint: 'Sink visited land by marking it as water to avoid revisiting.',
    tags: ['top150', 'graph'],
  },
  {
    id: '130',
    title: 'Surrounded Regions',
    difficulty: 'Med.',
    prompt: 'Capture all "O" regions that are fully surrounded by "X" by flipping them to "X".',
    solution: `def solve(board):
    if not board:
        return
    m, n = len(board), len(board[0])
    def dfs(i, j):
        if i < 0 or i >= m or j < 0 or j >= n or board[i][j] != 'O':
            return
        {{missing}}
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
                board[i][j] = 'O'`,
    missing: "board[i][j] = 'S'",
    hint: 'Mark border-connected Os as safe first, then flip remaining Os to X.',
    tags: ['top150', 'graph'],
  },
  {
    id: '133',
    title: 'Clone Graph',
    difficulty: 'Med.',
    prompt: 'Given a reference of a node in a connected undirected graph, return a deep copy.',
    solution: `def cloneGraph(node):
    if not node:
        return None
    clones = {}
    def dfs(n):
        if n in clones:
            return clones[n]
        clone = Node(n.val)
        {{missing}}
        clone.neighbors = [dfs(nb) for nb in n.neighbors]
        return clone
    return dfs(node)`,
    missing: 'clones[n] = clone',
    hint: 'Cache cloned nodes in a dictionary to handle cycles.',
    tags: ['top150', 'graph'],
  },
  {
    id: '399',
    title: 'Evaluate Division',
    difficulty: 'Med.',
    prompt: 'Given equations a/b=k, answer queries a/c by traversing the graph of ratios.',
    solution: `from collections import defaultdict

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
                {{missing}}
                if res != -1.0:
                    return w * res
        return -1.0
    return [dfs(a, b, set()) for a, b in queries]`,
    missing: 'res = dfs(nei, dst, visited)',
    hint: 'DFS through the ratio graph, multiplying weights along the path.',
    tags: ['top150', 'graph'],
  },
  {
    id: '207',
    title: 'Course Schedule',
    difficulty: 'Med.',
    prompt: 'There are numCourses courses with prerequisites. Determine if you can finish all courses (no cycles).',
    solution: `def canFinish(numCourses, prerequisites):
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
            {{missing}}
                queue.append(nei)
    return count == numCourses`,
    missing: 'if indegree[nei] == 0:',
    hint: 'Topological sort via BFS (Kahn\'s): enqueue nodes when their in-degree drops to 0.',
    tags: ['top150', 'graph'],
  },
  {
    id: '210',
    title: 'Course Schedule II',
    difficulty: 'Med.',
    prompt: 'Return the ordering of courses you should take to finish all courses, or an empty array if impossible.',
    solution: `def findOrder(numCourses, prerequisites):
    graph = [[] for _ in range(numCourses)]
    indegree = [0] * numCourses
    for a, b in prerequisites:
        graph[b].append(a)
        indegree[a] += 1
    queue = [i for i in range(numCourses) if indegree[i] == 0]
    order = []
    while queue:
        node = queue.pop()
        {{missing}}
        for nei in graph[node]:
            indegree[nei] -= 1
            if indegree[nei] == 0:
                queue.append(nei)
    return order if len(order) == numCourses else []`,
    missing: 'order.append(node)',
    hint: 'Topological sort: collect nodes in the order they reach in-degree 0.',
    tags: ['top150', 'graph'],
  },

  // ===== GRAPH BFS =====
  {
    id: '909',
    title: 'Snakes and Ladders',
    difficulty: 'Med.',
    prompt: 'Return the minimum number of dice rolls to reach the last square on a Snakes and Ladders board.',
    solution: `from collections import deque

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
                {{missing}}
                q.append((ns, moves + 1))
    return -1`,
    missing: 'visited.add(ns)',
    hint: 'BFS from square 1. Map square numbers to board coordinates, follow snakes/ladders.',
    tags: ['top150', 'graph-bfs'],
  },
  {
    id: '433',
    title: 'Minimum Genetic Mutation',
    difficulty: 'Med.',
    prompt: 'Find the minimum number of mutations to go from startGene to endGene. Each mutation changes one char and must be in the bank.',
    solution: `from collections import deque

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
                {{missing}}
                if mutation in bank_set and mutation not in visited:
                    if mutation == endGene:
                        return steps + 1
                    visited.add(mutation)
                    q.append((mutation, steps + 1))
    return -1`,
    missing: "mutation = gene[:i] + c + gene[i + 1:]",
    hint: 'BFS: at each step try all single-character mutations from ACGT at each position.',
    tags: ['top150', 'graph-bfs'],
  },
  {
    id: '127',
    title: 'Word Ladder',
    difficulty: 'Hard',
    prompt: 'Given beginWord, endWord, and a wordList, find the length of the shortest transformation sequence (each step changes one letter).',
    solution: `from collections import deque

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
                {{missing}}
                if nw == endWord:
                    return length + 1
                if nw in word_set and nw not in visited:
                    visited.add(nw)
                    q.append((nw, length + 1))
    return 0`,
    missing: "nw = word[:i] + c + word[i + 1:]",
    hint: 'BFS: try all single-letter changes at each position from a-z.',
    tags: ['top150', 'graph-bfs'],
  },

  // ===== TRIE =====
  {
    id: '208',
    title: 'Implement Trie (Prefix Tree)',
    difficulty: 'Med.',
    prompt: 'Implement a Trie with insert, search, and startsWith methods.',
    solution: `class TrieNode:
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
        {{missing}}

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
        return node`,
    missing: 'node.is_end = True',
    hint: 'After inserting all characters, mark the final node as end of word.',
    tags: ['top150', 'trie'],
  },
  {
    id: '211',
    title: 'Design Add and Search Words Data Structure',
    difficulty: 'Med.',
    prompt: 'Design a data structure supporting addWord and search where "." matches any letter.',
    solution: `class WordDictionary:
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
                {{missing}}
            if c not in node.children:
                return False
            node = node.children[c]
        return node.is_end`,
    missing: "return any(self.search(word[i + 1:], child) for child in node.children.values())",
    hint: 'On ".", recursively search all children for the remaining suffix.',
    tags: ['top150', 'trie'],
  },
  {
    id: '212',
    title: 'Word Search II',
    difficulty: 'Hard',
    prompt: 'Given a 2D board and a list of words, return all words that can be formed by sequentially adjacent cells.',
    solution: `def findWords(board, words):
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
            {{missing}}
                dfs(ni, nj, nxt)
        board[i][j] = c
    for i in range(m):
        for j in range(n):
            dfs(i, j, root)
    return res`,
    missing: 'if 0 <= ni < m and 0 <= nj < n:',
    hint: 'Build a trie of words, then DFS on the board guided by the trie to prune impossible paths.',
    tags: ['top150', 'trie'],
  },

  // ===== BACKTRACKING =====
  {
    id: '17',
    title: 'Letter Combinations of a Phone Number',
    difficulty: 'Med.',
    prompt: 'Given a string of digits 2-9, return all possible letter combinations (phone keypad mapping).',
    solution: `def letterCombinations(digits):
    if not digits:
        return []
    phone = {'2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl',
             '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz'}
    res = []
    def backtrack(i, cur):
        if i == len(digits):
            res.append(cur)
            return
        {{missing}}
            backtrack(i + 1, cur + c)
    backtrack(0, '')
    return res`,
    missing: "for c in phone[digits[i]]:",
    hint: 'Backtrack through each digit\'s letters, building the combination character by character.',
    tags: ['top150', 'backtracking'],
  },
  {
    id: '77',
    title: 'Combinations',
    difficulty: 'Med.',
    prompt: 'Given two integers n and k, return all possible combinations of k numbers from [1, n].',
    solution: `def combine(n, k):
    res = []
    def backtrack(start, combo):
        if len(combo) == k:
            res.append(combo[:])
            return
        for i in range(start, n + 1):
            combo.append(i)
            {{missing}}
            combo.pop()
    backtrack(1, [])
    return res`,
    missing: 'backtrack(i + 1, combo)',
    hint: 'Recurse with i+1 to avoid duplicates and build combinations in order.',
    tags: ['top150', 'backtracking'],
  },
  {
    id: '46',
    title: 'Permutations',
    difficulty: 'Med.',
    prompt: 'Given an array of distinct integers, return all possible permutations.',
    solution: `def permute(nums):
    res = []
    def backtrack(path, remaining):
        if not remaining:
            res.append(path)
            return
        for i in range(len(remaining)):
            {{missing}}
    backtrack([], nums)
    return res`,
    missing: 'backtrack(path + [remaining[i]], remaining[:i] + remaining[i + 1:])',
    hint: 'Choose each remaining element in turn, adding it to the path and recursing on the rest.',
    tags: ['top150', 'backtracking'],
  },
  {
    id: '39',
    title: 'Combination Sum',
    difficulty: 'Med.',
    prompt: 'Given an array of distinct integers and a target, return all unique combinations that sum to target. Numbers may be reused.',
    solution: `def combinationSum(candidates, target):
    res = []
    def backtrack(start, combo, total):
        if total == target:
            res.append(combo[:])
            return
        if total > target:
            return
        for i in range(start, len(candidates)):
            combo.append(candidates[i])
            {{missing}}
            combo.pop()
    backtrack(0, [], 0)
    return res`,
    missing: 'backtrack(i, combo, total + candidates[i])',
    hint: 'Pass i (not i+1) to allow reusing the same element.',
    tags: ['top150', 'backtracking'],
  },
  {
    id: '52',
    title: 'N-Queens II',
    difficulty: 'Hard',
    prompt: 'Return the number of distinct solutions to the n-queens puzzle.',
    solution: `def totalNQueens(n):
    count = [0]
    cols = set()
    diag1 = set()
    diag2 = set()
    def backtrack(row):
        if row == n:
            count[0] += 1
            return
        for col in range(n):
            {{missing}}
                continue
            cols.add(col); diag1.add(row - col); diag2.add(row + col)
            backtrack(row + 1)
            cols.remove(col); diag1.remove(row - col); diag2.remove(row + col)
    backtrack(0)
    return count[0]`,
    missing: 'if col in cols or row - col in diag1 or row + col in diag2:',
    hint: 'Track attacked columns and both diagonals using sets.',
    tags: ['top150', 'backtracking'],
  },
  {
    id: '22',
    title: 'Generate Parentheses',
    difficulty: 'Med.',
    prompt: 'Given n pairs of parentheses, generate all valid combinations.',
    solution: `def generateParenthesis(n):
    res = []
    def backtrack(s, open_count, close_count):
        if len(s) == 2 * n:
            res.append(s)
            return
        if open_count < n:
            backtrack(s + '(', open_count + 1, close_count)
        {{missing}}
            backtrack(s + ')', open_count, close_count + 1)
    backtrack('', 0, 0)
    return res`,
    missing: 'if close_count < open_count:',
    hint: 'Only add a closing paren when the close count is less than the open count.',
    tags: ['top150', 'backtracking'],
  },
  {
    id: '79',
    title: 'Word Search',
    difficulty: 'Med.',
    prompt: 'Given a 2D board and a word, determine if the word exists in the grid by moving to adjacent cells.',
    solution: `def exist(board, word):
    m, n = len(board), len(board[0])
    def dfs(i, j, k):
        if k == len(word):
            return True
        if i < 0 or i >= m or j < 0 or j >= n or board[i][j] != word[k]:
            return False
        tmp = board[i][j]
        board[i][j] = '#'
        {{missing}}
        board[i][j] = tmp
        return found
    for i in range(m):
        for j in range(n):
            if dfs(i, j, 0):
                return True
    return False`,
    missing: 'found = dfs(i+1,j,k+1) or dfs(i-1,j,k+1) or dfs(i,j+1,k+1) or dfs(i,j-1,k+1)',
    hint: 'Mark visited cells, explore all 4 directions, then restore the cell.',
    tags: ['top150', 'backtracking'],
  },

  // ===== DIVIDE & CONQUER =====
  {
    id: '108',
    title: 'Convert Sorted Array to Binary Search Tree',
    difficulty: 'Easy',
    prompt: 'Given a sorted array, convert it to a height-balanced BST.',
    solution: `def sortedArrayToBST(nums):
    if not nums:
        return None
    {{missing}}
    root = TreeNode(nums[mid])
    root.left = sortedArrayToBST(nums[:mid])
    root.right = sortedArrayToBST(nums[mid + 1:])
    return root`,
    missing: 'mid = len(nums) // 2',
    hint: 'Pick the middle element as root to keep the tree balanced.',
    tags: ['top150', 'divide-conquer'],
  },
  {
    id: '148',
    title: 'Sort List',
    difficulty: 'Med.',
    prompt: 'Sort a linked list in O(n log n) time and O(1) space.',
    solution: `def sortList(head):
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
    {{missing}}`,
    missing: 'return merge(left, right)',
    hint: 'Split at the midpoint, recursively sort both halves, then merge.',
    tags: ['top150', 'divide-conquer'],
  },
  {
    id: '427',
    title: 'Construct Quad Tree',
    difficulty: 'Med.',
    prompt: 'Given an n x n grid of 0s and 1s, construct a Quad-Tree representation.',
    solution: `def construct(grid):
    def build(r, c, size):
        if size == 1:
            return Node(grid[r][c] == 1, True)
        half = size // 2
        tl = build(r, c, half)
        tr = build(r, c + half, half)
        bl = build(r + half, c, half)
        br = build(r + half, c + half, half)
        if tl.isLeaf and tr.isLeaf and bl.isLeaf and br.isLeaf and tl.val == tr.val == bl.val == br.val:
            {{missing}}
        return Node(False, False, tl, tr, bl, br)
    return build(0, 0, len(grid))`,
    missing: 'return Node(tl.val, True)',
    hint: 'If all four children are leaves with the same value, merge them into one leaf.',
    tags: ['top150', 'divide-conquer'],
  },
  {
    id: '23',
    title: 'Merge k Sorted Lists',
    difficulty: 'Hard',
    prompt: 'Merge k sorted linked lists into one sorted linked list.',
    solution: `import heapq

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
            {{missing}}
    return dummy.next`,
    missing: 'heapq.heappush(heap, (node.next.val, i, node.next))',
    hint: 'Use a min-heap to always pick the smallest head among all lists.',
    tags: ['top150', 'divide-conquer'],
  },

  // ===== KADANE'S =====
  {
    id: '53',
    title: 'Maximum Subarray',
    difficulty: 'Med.',
    prompt: 'Find the contiguous subarray with the largest sum.',
    solution: `def maxSubArray(nums):
    max_sum = cur_sum = nums[0]
    for num in nums[1:]:
        {{missing}}
        max_sum = max(max_sum, cur_sum)
    return max_sum`,
    missing: 'cur_sum = max(num, cur_sum + num)',
    hint: 'At each step decide: start fresh or extend the current subarray.',
    tags: ['top150', 'kadane'],
  },
  {
    id: '918',
    title: 'Maximum Sum Circular Subarray',
    difficulty: 'Med.',
    prompt: 'Given a circular integer array, find the maximum possible subarray sum.',
    solution: `def maxSubarraySumCircular(nums):
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
    {{missing}}`,
    missing: 'return max(max_sum, total - min_sum) if max_sum > 0 else max_sum',
    hint: 'The max circular sum is either a normal Kadane max or total minus the minimum subarray, unless all values are negative.',
    tags: ['top150', 'kadane'],
  },

  // ===== BINARY SEARCH =====
  {
    id: '35',
    title: 'Search Insert Position',
    difficulty: 'Easy',
    prompt: 'Given a sorted array and a target, return the index where it would be inserted.',
    solution: `def searchInsert(nums, target):
    l, r = 0, len(nums) - 1
    while l <= r:
        mid = (l + r) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            {{missing}}
        else:
            r = mid - 1
    return l`,
    missing: 'l = mid + 1',
    hint: 'Standard binary search; when not found, l is the correct insertion point.',
    tags: ['top150', 'binary-search'],
  },
  {
    id: '74',
    title: 'Search a 2D Matrix',
    difficulty: 'Med.',
    prompt: 'Search for a target in a sorted m x n matrix where each row follows the previous row\'s last element.',
    solution: `def searchMatrix(matrix, target):
    m, n = len(matrix), len(matrix[0])
    l, r = 0, m * n - 1
    while l <= r:
        mid = (l + r) // 2
        {{missing}}
        if val == target:
            return True
        elif val < target:
            l = mid + 1
        else:
            r = mid - 1
    return False`,
    missing: 'val = matrix[mid // n][mid % n]',
    hint: 'Treat the matrix as a flat sorted array using divmod to get row and column.',
    tags: ['top150', 'binary-search'],
  },
  {
    id: '162',
    title: 'Find Peak Element',
    difficulty: 'Med.',
    prompt: 'Find a peak element in an array (strictly greater than neighbors) and return its index.',
    solution: `def findPeakElement(nums):
    l, r = 0, len(nums) - 1
    while l < r:
        mid = (l + r) // 2
        {{missing}}
            r = mid
        else:
            l = mid + 1
    return l`,
    missing: 'if nums[mid] > nums[mid + 1]:',
    hint: 'Binary search: move toward the side with the larger neighbor.',
    tags: ['top150', 'binary-search'],
  },
  {
    id: '33',
    title: 'Search in Rotated Sorted Array',
    difficulty: 'Med.',
    prompt: 'Search for a target in a rotated sorted array. Return its index or -1.',
    solution: `def search(nums, target):
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
            {{missing}}
                l = mid + 1
            else:
                r = mid - 1
    return -1`,
    missing: 'if nums[mid] < target <= nums[r]:',
    hint: 'Determine which half is sorted and check if the target lies in that range.',
    tags: ['top150', 'binary-search'],
  },
  {
    id: '34',
    title: 'Find First and Last Position of Element in Sorted Array',
    difficulty: 'Med.',
    prompt: 'Find the starting and ending position of a given target in a sorted array.',
    solution: `def searchRange(nums, target):
    def bisect(left_bias):
        l, r = 0, len(nums) - 1
        idx = -1
        while l <= r:
            mid = (l + r) // 2
            if nums[mid] == target:
                idx = mid
                {{missing}}
            elif nums[mid] < target:
                l = mid + 1
            else:
                r = mid - 1
        return idx
    return [bisect(True), bisect(False)]`,
    missing: 'if left_bias: r = mid - 1\n                else: l = mid + 1',
    hint: 'Run binary search twice: once biased left (to find first) and once biased right (to find last).',
    tags: ['top150', 'binary-search'],
  },
  {
    id: '153',
    title: 'Find Minimum in Rotated Sorted Array',
    difficulty: 'Med.',
    prompt: 'Find the minimum element in a rotated sorted array (no duplicates).',
    solution: `def findMin(nums):
    l, r = 0, len(nums) - 1
    while l < r:
        mid = (l + r) // 2
        {{missing}}
            l = mid + 1
        else:
            r = mid
    return nums[l]`,
    missing: 'if nums[mid] > nums[r]:',
    hint: 'If mid > right, the minimum is in the right half.',
    tags: ['top150', 'binary-search'],
  },
  {
    id: '4',
    title: 'Median of Two Sorted Arrays',
    difficulty: 'Hard',
    prompt: 'Given two sorted arrays, return the median of the combined array in O(log(m+n)).',
    solution: `def findMedianSortedArrays(nums1, nums2):
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
            {{missing}}
        elif left1 > right2:
            r = i - 1
        else:
            l = i + 1`,
    missing: "if (m + n) % 2 == 0: return (max(left1, left2) + min(right1, right2)) / 2\n            else: return max(left1, left2)",
    hint: 'Binary search on the smaller array to find a partition where all left elements <= all right elements.',
    tags: ['top150', 'binary-search'],
  },

  // ===== HEAP =====
  {
    id: '215',
    title: 'Kth Largest Element in an Array',
    difficulty: 'Med.',
    prompt: 'Find the kth largest element in an unsorted array.',
    solution: `import heapq

def findKthLargest(nums, k):
    heap = []
    for num in nums:
        heapq.heappush(heap, num)
        {{missing}}
            heapq.heappop(heap)
    return heap[0]`,
    missing: 'if len(heap) > k:',
    hint: 'Maintain a min-heap of size k; the top is the kth largest.',
    tags: ['top150', 'heap'],
  },
  {
    id: '502',
    title: 'IPO',
    difficulty: 'Hard',
    prompt: 'Maximize capital after completing at most k projects. Each project has a profit and minimum capital requirement.',
    solution: `import heapq

def findMaximizedCapital(k, w, profits, capital):
    projects = sorted(zip(capital, profits))
    heap = []
    i = 0
    for _ in range(k):
        while i < len(projects) and projects[i][0] <= w:
            {{missing}}
            i += 1
        if not heap:
            break
        w += -heapq.heappop(heap)
    return w`,
    missing: 'heapq.heappush(heap, -projects[i][1])',
    hint: 'Greedily pick the most profitable affordable project using a max-heap (negate values).',
    tags: ['top150', 'heap'],
  },
  {
    id: '373',
    title: 'Find K Pairs with Smallest Sums',
    difficulty: 'Med.',
    prompt: 'Given two sorted arrays, find k pairs (u, v) with the smallest sums.',
    solution: `import heapq

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
            {{missing}}
    return res`,
    missing: 'heapq.heappush(heap, (nums1[i] + nums2[j + 1], i, j + 1))',
    hint: 'Start with (nums1[i], nums2[0]) pairs in a heap; for each popped pair advance the nums2 index.',
    tags: ['top150', 'heap'],
  },
  {
    id: '295',
    title: 'Find Median from Data Stream',
    difficulty: 'Hard',
    prompt: 'Design a data structure that supports addNum and findMedian for a stream of integers.',
    solution: `import heapq

class MedianFinder:
    def __init__(self):
        self.lo = []  # max-heap (negated)
        self.hi = []  # min-heap

    def addNum(self, num):
        heapq.heappush(self.lo, -num)
        {{missing}}
        if len(self.lo) > len(self.hi) + 1:
            heapq.heappush(self.hi, -heapq.heappop(self.lo))

    def findMedian(self):
        if len(self.lo) > len(self.hi):
            return -self.lo[0]
        return (-self.lo[0] + self.hi[0]) / 2`,
    missing: 'heapq.heappush(self.hi, -heapq.heappop(self.lo))\n        if self.hi and -self.lo[0] > self.hi[0]: heapq.heappush(self.lo, -heapq.heappop(self.hi))',
    hint: 'Use two heaps: a max-heap for the lower half and a min-heap for the upper half, keeping them balanced.',
    tags: ['top150', 'heap'],
  },

  // ===== BIT MANIPULATION =====
  {
    id: '67',
    title: 'Add Binary',
    difficulty: 'Easy',
    prompt: 'Given two binary strings, return their sum as a binary string.',
    solution: `def addBinary(a, b):
    result = []
    carry = 0
    i, j = len(a) - 1, len(b) - 1
    while i >= 0 or j >= 0 or carry:
        total = carry
        if i >= 0:
            total += int(a[i]); i -= 1
        if j >= 0:
            total += int(b[j]); j -= 1
        {{missing}}
        carry = total // 2
    return ''.join(reversed(result))`,
    missing: "result.append(str(total % 2))",
    hint: 'Process from right to left, appending bit % 2 and carrying bit // 2.',
    tags: ['top150', 'bit'],
  },
  {
    id: '190',
    title: 'Reverse Bits',
    difficulty: 'Easy',
    prompt: 'Reverse the bits of a given 32-bit unsigned integer.',
    solution: `def reverseBits(n):
    result = 0
    for _ in range(32):
        {{missing}}
        n >>= 1
    return result`,
    missing: 'result = (result << 1) | (n & 1)',
    hint: 'Shift result left and OR with the lowest bit of n each iteration.',
    tags: ['top150', 'bit'],
  },
  {
    id: '191',
    title: 'Number of 1 Bits',
    difficulty: 'Easy',
    prompt: 'Return the number of 1 bits in the binary representation of an unsigned integer.',
    solution: `def hammingWeight(n):
    count = 0
    while n:
        {{missing}}
        count += 1
    return count`,
    missing: 'n &= n - 1',
    hint: 'n & (n-1) clears the lowest set bit each iteration.',
    tags: ['top150', 'bit'],
  },
  {
    id: '136',
    title: 'Single Number',
    difficulty: 'Easy',
    prompt: 'Every element appears twice except one. Find the single element.',
    solution: `def singleNumber(nums):
    result = 0
    for num in nums:
        {{missing}}
    return result`,
    missing: 'result ^= num',
    hint: 'XOR of a number with itself is 0; XOR all elements to isolate the unique one.',
    tags: ['top150', 'bit'],
  },
  {
    id: '137',
    title: 'Single Number II',
    difficulty: 'Med.',
    prompt: 'Every element appears three times except one. Find the single element.',
    solution: `def singleNumber(nums):
    ones = twos = 0
    for num in nums:
        {{missing}}
        twos = (twos ^ num) & ~ones
    return ones`,
    missing: 'ones = (ones ^ num) & ~twos',
    hint: 'Use two bitmasks to count each bit modulo 3.',
    tags: ['top150', 'bit'],
  },
  {
    id: '201',
    title: 'Bitwise AND of Numbers Range',
    difficulty: 'Med.',
    prompt: 'Given a range [left, right], return the bitwise AND of all numbers in the range.',
    solution: `def rangeBitwiseAnd(left, right):
    shift = 0
    while left != right:
        left >>= 1
        right >>= 1
        {{missing}}
    return left << shift`,
    missing: 'shift += 1',
    hint: 'Right-shift both numbers until they are equal; the common prefix is the AND result.',
    tags: ['top150', 'bit'],
  },

  // ===== MATH =====
  {
    id: '9',
    title: 'Palindrome Number',
    difficulty: 'Easy',
    prompt: 'Determine whether an integer is a palindrome without converting to string.',
    solution: `def isPalindrome(x):
    if x < 0 or (x % 10 == 0 and x != 0):
        return False
    rev = 0
    while x > rev:
        {{missing}}
        x //= 10
    return x == rev or x == rev // 10`,
    missing: 'rev = rev * 10 + x % 10',
    hint: 'Reverse the second half of the number and compare it to the first half.',
    tags: ['top150', 'math'],
  },
  {
    id: '66',
    title: 'Plus One',
    difficulty: 'Easy',
    prompt: 'Given a large integer as an array of digits, add one to it.',
    solution: `def plusOne(digits):
    for i in range(len(digits) - 1, -1, -1):
        if digits[i] < 9:
            {{missing}}
            return digits
        digits[i] = 0
    return [1] + digits`,
    missing: 'digits[i] += 1',
    hint: 'Walk from the last digit; if it\'s < 9 just increment and return, otherwise set to 0 and carry.',
    tags: ['top150', 'math'],
  },
  {
    id: '172',
    title: 'Factorial Trailing Zeroes',
    difficulty: 'Med.',
    prompt: 'Given an integer n, return the number of trailing zeroes in n!.',
    solution: `def trailingZeroes(n):
    count = 0
    while n >= 5:
        {{missing}}
        count += n
    return count`,
    missing: 'n //= 5',
    hint: 'Count factors of 5: n/5 + n/25 + n/125 + ...',
    tags: ['top150', 'math'],
  },
  {
    id: '69',
    title: 'Sqrt(x)',
    difficulty: 'Easy',
    prompt: 'Compute the integer square root of x (truncated).',
    solution: `def mySqrt(x):
    l, r = 0, x
    while l <= r:
        mid = (l + r) // 2
        if mid * mid <= x:
            {{missing}}
            l = mid + 1
        else:
            r = mid - 1
    return ans`,
    missing: 'ans = mid',
    hint: 'Binary search for the largest mid where mid*mid <= x.',
    tags: ['top150', 'math'],
  },
  {
    id: '50',
    title: 'Pow(x, n)',
    difficulty: 'Med.',
    prompt: 'Implement pow(x, n) computing x raised to the power n.',
    solution: `def myPow(x, n):
    if n < 0:
        x, n = 1 / x, -n
    result = 1
    while n:
        if n % 2 == 1:
            result *= x
        {{missing}}
        n //= 2
    return result`,
    missing: 'x *= x',
    hint: 'Exponentiation by squaring: square x and halve n each step.',
    tags: ['top150', 'math'],
  },
  {
    id: '149',
    title: 'Max Points on a Line',
    difficulty: 'Hard',
    prompt: 'Given n points on a 2D plane, find the maximum number of points on the same straight line.',
    solution: `from collections import defaultdict
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
            {{missing}}
            slopes[(dx // g, dy // g)] += 1
        ans = max(ans, max(slopes.values()) + 1)
    return ans`,
    missing: 'if g != 0: dx, dy = dx // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1), dy // g * (1 if dx // g > 0 or (dx == 0 and dy > 0) else -1)',
    hint: 'Normalize slope by GCD and sign to group collinear points. Count max points sharing a slope from each anchor.',
    tags: ['top150', 'math'],
  },

  // ===== 1D DP =====
  {
    id: '70',
    title: 'Climbing Stairs',
    difficulty: 'Easy',
    prompt: 'You can climb 1 or 2 steps. How many distinct ways can you climb to the top (n steps)?',
    solution: `def climbStairs(n):
    a, b = 1, 1
    for _ in range(n - 1):
        {{missing}}
    return b`,
    missing: 'a, b = b, a + b',
    hint: 'This is the Fibonacci sequence: ways(n) = ways(n-1) + ways(n-2).',
    tags: ['top150', 'dp'],
  },
  {
    id: '198',
    title: 'House Robber',
    difficulty: 'Med.',
    prompt: 'Given an array of house values, find the maximum money you can rob without robbing two adjacent houses.',
    solution: `def rob(nums):
    prev1 = prev2 = 0
    for num in nums:
        {{missing}}
        prev2 = prev1
        prev1 = temp
    return prev1`,
    missing: 'temp = max(prev1, prev2 + num)',
    hint: 'At each house choose: skip it (prev1) or rob it (prev2 + num).',
    tags: ['top150', 'dp'],
  },
  {
    id: '139',
    title: 'Word Break',
    difficulty: 'Med.',
    prompt: 'Given a string s and a dictionary wordDict, return true if s can be segmented into dictionary words.',
    solution: `def wordBreak(s, wordDict):
    word_set = set(wordDict)
    dp = [False] * (len(s) + 1)
    dp[0] = True
    for i in range(1, len(s) + 1):
        for j in range(i):
            {{missing}}
                dp[i] = True
                break
    return dp[len(s)]`,
    missing: 'if dp[j] and s[j:i] in word_set:',
    hint: 'dp[i] is True if there exists j < i such that dp[j] is True and s[j:i] is a word.',
    tags: ['top150', 'dp'],
  },
  {
    id: '322',
    title: 'Coin Change',
    difficulty: 'Med.',
    prompt: 'Given coin denominations and an amount, return the fewest coins needed to make the amount, or -1.',
    solution: `def coinChange(coins, amount):
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for i in range(1, amount + 1):
        for c in coins:
            if c <= i:
                {{missing}}
    return dp[amount] if dp[amount] != float('inf') else -1`,
    missing: 'dp[i] = min(dp[i], dp[i - c] + 1)',
    hint: 'For each amount, try every coin and take the minimum count.',
    tags: ['top150', 'dp'],
  },
  {
    id: '300',
    title: 'Longest Increasing Subsequence',
    difficulty: 'Med.',
    prompt: 'Given an integer array, return the length of the longest strictly increasing subsequence.',
    solution: `import bisect

def lengthOfLIS(nums):
    tails = []
    for num in nums:
        pos = bisect.bisect_left(tails, num)
        {{missing}}
            tails.append(num)
        else:
            tails[pos] = num
    return len(tails)`,
    missing: 'if pos == len(tails):',
    hint: 'Maintain a tails array; binary search for where each number fits to keep it as small as possible.',
    tags: ['top150', 'dp'],
  },

  // ===== MULTIDIMENSIONAL DP =====
  {
    id: '120',
    title: 'Triangle',
    difficulty: 'Med.',
    prompt: 'Given a triangle array, find the minimum path sum from top to bottom (moving to adjacent numbers on the row below).',
    solution: `def minimumTotal(triangle):
    dp = triangle[-1][:]
    for i in range(len(triangle) - 2, -1, -1):
        for j in range(len(triangle[i])):
            {{missing}}
    return dp[0]`,
    missing: 'dp[j] = triangle[i][j] + min(dp[j], dp[j + 1])',
    hint: 'Bottom-up DP: at each cell pick the smaller of the two children below.',
    tags: ['top150', 'dp'],
  },
  {
    id: '64',
    title: 'Minimum Path Sum',
    difficulty: 'Med.',
    prompt: 'Given an m x n grid of non-negative numbers, find a path from top-left to bottom-right that minimizes the sum.',
    solution: `def minPathSum(grid):
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
                {{missing}}
    return grid[m - 1][n - 1]`,
    missing: 'grid[i][j] += min(grid[i - 1][j], grid[i][j - 1])',
    hint: 'Each cell\'s cost = its value + min of the cell above and cell to the left.',
    tags: ['top150', 'dp'],
  },
  {
    id: '63',
    title: 'Unique Paths II',
    difficulty: 'Med.',
    prompt: 'A robot on an m x n grid with obstacles can move right or down. How many unique paths exist from top-left to bottom-right?',
    solution: `def uniquePathsWithObstacles(grid):
    m, n = len(grid), len(grid[0])
    dp = [0] * n
    dp[0] = 1
    for i in range(m):
        for j in range(n):
            if grid[i][j] == 1:
                dp[j] = 0
            elif j > 0:
                {{missing}}
    return dp[n - 1]`,
    missing: 'dp[j] += dp[j - 1]',
    hint: 'Paths to cell (i,j) = paths from above (already in dp[j]) + paths from the left (dp[j-1]).',
    tags: ['top150', 'dp'],
  },
  {
    id: '5',
    title: 'Longest Palindromic Substring',
    difficulty: 'Med.',
    prompt: 'Given a string s, return the longest palindromic substring.',
    solution: `def longestPalindrome(s):
    res = ""
    def expand(l, r):
        nonlocal res
        while l >= 0 and r < len(s) and s[l] == s[r]:
            if r - l + 1 > len(res):
                {{missing}}
            l -= 1
            r += 1
    for i in range(len(s)):
        expand(i, i)
        expand(i, i + 1)
    return res`,
    missing: 'res = s[l:r + 1]',
    hint: 'Expand around each center (odd and even lengths) and track the longest palindrome found.',
    tags: ['top150', 'dp'],
  },
  {
    id: '97',
    title: 'Interleaving String',
    difficulty: 'Med.',
    prompt: 'Given strings s1, s2, and s3, determine if s3 is formed by interleaving s1 and s2.',
    solution: `def isInterleave(s1, s2, s3):
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
                {{missing}}
    return dp[len(s2)]`,
    missing: "dp[j] = (dp[j] and s1[i - 1] == s3[i + j - 1]) or (dp[j - 1] and s2[j - 1] == s3[i + j - 1])",
    hint: 'dp[j] is True if we can form s3[:i+j] from s1[:i] and s2[:j], checking the last char from either string.',
    tags: ['top150', 'dp'],
  },
  {
    id: '72',
    title: 'Edit Distance',
    difficulty: 'Med.',
    prompt: 'Given two strings word1 and word2, return the minimum edit distance (insert, delete, replace).',
    solution: `def minDistance(word1, word2):
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
                {{missing}}
            prev = temp
    return dp[n]`,
    missing: 'dp[j] = 1 + min(prev, dp[j], dp[j - 1])',
    hint: 'If chars differ, take 1 + min of replace (diagonal), delete (above), or insert (left).',
    tags: ['top150', 'dp'],
  },
  {
    id: '123',
    title: 'Best Time to Buy and Sell Stock III',
    difficulty: 'Hard',
    prompt: 'Find the maximum profit with at most two transactions.',
    solution: `def maxProfit(prices):
    buy1 = buy2 = float('inf')
    profit1 = profit2 = 0
    for p in prices:
        buy1 = min(buy1, p)
        profit1 = max(profit1, p - buy1)
        {{missing}}
        profit2 = max(profit2, p - buy2)
    return profit2`,
    missing: 'buy2 = min(buy2, p - profit1)',
    hint: 'Track two transactions: buy2 uses the profit from the first sale as a discount.',
    tags: ['top150', 'dp'],
  },
  {
    id: '188',
    title: 'Best Time to Buy and Sell Stock IV',
    difficulty: 'Hard',
    prompt: 'Find the maximum profit with at most k transactions.',
    solution: `def maxProfit(k, prices):
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
            {{missing}}
    return dp[k][n - 1]`,
    missing: 'max_diff = max(max_diff, dp[t - 1][d] - prices[d])',
    hint: 'Optimize the inner loop by tracking max(dp[t-1][j] - prices[j]) as you go.',
    tags: ['top150', 'dp'],
  },
  {
    id: '221',
    title: 'Maximal Square',
    difficulty: 'Med.',
    prompt: 'Find the largest square containing only 1s in a binary matrix and return its area.',
    solution: `def maximalSquare(matrix):
    if not matrix:
        return 0
    m, n = len(matrix), len(matrix[0])
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    max_side = 0
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if matrix[i - 1][j - 1] == '1':
                {{missing}}
                max_side = max(max_side, dp[i][j])
    return max_side * max_side`,
    missing: 'dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1',
    hint: 'The side of the largest square at (i,j) = 1 + min of top, left, and top-left neighbors.',
    tags: ['top150', 'dp'],
  },
]
