-- ============================================================================
-- Data File - 10 Sample Questions with Answers
-- ============================================================================

-- ============================================================================
-- Topics Table
-- ============================================================================
INSERT INTO topics (name, description, archived, created_at) VALUES
('Arrays', 'Problems involving array manipulation and search', FALSE, CURRENT_TIMESTAMP),
('Strings', 'String manipulation and pattern matching', FALSE, CURRENT_TIMESTAMP),
('Hash Table', 'Hash map and set problems', FALSE, CURRENT_TIMESTAMP),
('Linked List', 'Linked list operations and traversal', FALSE, CURRENT_TIMESTAMP),
('Stack', 'Stack-based algorithms', FALSE, CURRENT_TIMESTAMP),
('Sorting', 'Sorting algorithms and techniques', FALSE, CURRENT_TIMESTAMP),
('Tree', 'Binary tree and tree traversal', FALSE, CURRENT_TIMESTAMP),
('Dynamic Programming', 'Optimization problems using DP', FALSE, CURRENT_TIMESTAMP),
('Searching', 'Binary search and search techniques', FALSE, CURRENT_TIMESTAMP),
('Graph', 'Graph algorithms and traversal', FALSE, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Questions Table (10 Sample Questions)
-- ============================================================================
INSERT INTO questions (question_text, difficulty, leetcode_number, mode, solution, hint_1, hint_2, hint_3, archived, created_at, updated_at) VALUES
('Two Sum', 'Easy', 1, 'mc', $$function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    _____
    map.set(nums[i], i);
  }
  return [];
}$$, 'Use a hash table to store numbers', 'Check if complement exists in map', 'Return indices when match found', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('Reverse String', 'Easy', 344, 'mc', $$function reverseString(s) {
  let left = 0;
  let right = s.length - 1;
  while (left < right) {
    _____
    left++;
    right--;
  }
  return s;
}$$, 'Two pointers from both ends', 'Swap characters', 'Move pointers to center', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('Valid Parentheses', 'Easy', 20, 'mc', $$function isValid(s) {
  const stack = [];
  const pairs = {")": "(", "}": "{", "]": "["};
  for (let char of s) {
    if (char in pairs) {
      _____
      return false;
    } else {
      stack.push(char);
    }
  }
  return stack.length === 0;
}$$, 'Use stack for brackets', 'Match closing with opening', 'Stack must be empty at end', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('Remove Duplicates', 'Easy', 26, 'mc', $$function removeDuplicates(nums) {
  if (nums.length === 0) return 0;
  let k = 1;
  for (let i = 1; i < nums.length; i++) {
    _____
  }
  return k;
}$$, 'Two pointers approach', 'Only move k on unique', 'Compare with previous', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('Contains Duplicate', 'Easy', 217, 'mc', $$function containsDuplicate(nums) {
  const seen = new Set();
  for (const num of nums) {
    _____
    seen.add(num);
  }
  return false;
}$$, 'Use set for tracking', 'Check if already seen', 'Return true if duplicate', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('Maximum Subarray', 'Easy', 53, 'mc', $$function maxSubArray(nums) {
  let maxCurrent = nums[0];
  let maxGlobal = nums[0];
  for (let i = 1; i < nums.length; i++) {
    _____
    if (maxCurrent > maxGlobal) maxGlobal = maxCurrent;
  }
  return maxGlobal;
}$$, 'Kadane algorithm', 'Reset on negative', 'Compare with global max', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('Valid Anagram', 'Easy', 242, 'mc', $$function isAnagram(s, t) {
  if (s.length !== t.length) return false;
  const freq = {};
  for (const char of s) {
    _____
  }
}$$, 'Count char frequencies', 'Anagrams have same counts', 'Decrement on second pass', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('Longest Palindromic Substring', 'Med.', 5, 'mc', $$function longestPalindrome(s) {
  if (s.length < 2) return s;
  let start = 0, end = 0;
  function expandAroundCenter(left, right) {
    _____
    return right - left - 1;
  }
}$$, 'Expand around center', 'Check odd and even lengths', 'Track longest found', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('Group Anagrams', 'Med.', 49, 'mc', $$function groupAnagrams(strs) {
  const map = new Map();
  for (const str of strs) {
    const key = str.split("").sort().join("");
    _____
  }
  return Array.from(map.values());
}$$, 'Sorted string as key', 'Anagrams have same sorted form', 'Group by key', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('Three Sum', 'Med.', 15, 'mc', $$function threeSum(nums) {
  nums.sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < nums.length - 2; i++) {
    _____
  }
  return result;
}$$, 'Sort array first', 'Use two pointers', 'Skip duplicates', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ============================================================================
-- Question Topics Relationships
-- ============================================================================
INSERT INTO question_topics (question_id, topic_id, created_at) VALUES
(1, (SELECT id FROM topics WHERE name = 'Arrays'), CURRENT_TIMESTAMP),
(1, (SELECT id FROM topics WHERE name = 'Hash Table'), CURRENT_TIMESTAMP),
(2, (SELECT id FROM topics WHERE name = 'Strings'), CURRENT_TIMESTAMP),
(3, (SELECT id FROM topics WHERE name = 'Stack'), CURRENT_TIMESTAMP),
(3, (SELECT id FROM topics WHERE name = 'Strings'), CURRENT_TIMESTAMP),
(4, (SELECT id FROM topics WHERE name = 'Arrays'), CURRENT_TIMESTAMP),
(5, (SELECT id FROM topics WHERE name = 'Arrays'), CURRENT_TIMESTAMP),
(5, (SELECT id FROM topics WHERE name = 'Hash Table'), CURRENT_TIMESTAMP),
(6, (SELECT id FROM topics WHERE name = 'Arrays'), CURRENT_TIMESTAMP),
(6, (SELECT id FROM topics WHERE name = 'Dynamic Programming'), CURRENT_TIMESTAMP),
(7, (SELECT id FROM topics WHERE name = 'Strings'), CURRENT_TIMESTAMP),
(7, (SELECT id FROM topics WHERE name = 'Hash Table'), CURRENT_TIMESTAMP),
(8, (SELECT id FROM topics WHERE name = 'Strings'), CURRENT_TIMESTAMP),
(9, (SELECT id FROM topics WHERE name = 'Strings'), CURRENT_TIMESTAMP),
(9, (SELECT id FROM topics WHERE name = 'Hash Table'), CURRENT_TIMESTAMP),
(10, (SELECT id FROM topics WHERE name = 'Arrays'), CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Answers Table (4 options per question, 1 correct)
-- ============================================================================

-- Question 1: Two Sum
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(1, 'if (map.has(complement)) return [map.get(complement), i];', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 'if (complement === i) return [i, i + 1];', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 'if (nums[i] === target) return [0, i];', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 'if (map.size > 2) return [0, 1];', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Question 2: Reverse String
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(2, '[s[left], s[right]] = [s[right], s[left]];', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(2, 's[left] = s[right];', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(2, 's.reverse();', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(2, 's = s.split("").reverse().join("");', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Question 3: Valid Parentheses
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(3, 'if (stack.pop() !== pairs[char]) return false;', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(3, 'if (stack[stack.length - 1] !== char) return false;', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(3, 'if (!pairs.includes(char)) return false;', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(3, 'if (stack.length === 0) return false;', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Question 4: Remove Duplicates
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(4, 'if (nums[i] !== nums[i-1]) nums[k++] = nums[i];', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(4, 'if (nums[i] === nums[i-1]) k++;', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(4, 'nums.splice(i, 1);', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(4, 'if (i > 0) k++;', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Question 5: Contains Duplicate
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(5, 'if (seen.has(num)) return true;', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(5, 'if (num > 0) return true;', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(5, 'if (seen.size > nums.length / 2) return true;', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(5, 'if (num === seen.values().next().value) return true;', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Question 6: Maximum Subarray
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(6, 'maxCurrent = Math.max(nums[i], maxCurrent + nums[i]);', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(6, 'maxCurrent += nums[i];', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(6, 'maxCurrent = Math.min(nums[i], maxCurrent);', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(6, 'maxCurrent = nums[i];', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Question 7: Valid Anagram
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(7, 'freq[char] = (freq[char] || 0) + 1;', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(7, 'freq[char] = 1;', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(7, 'freq.push(char);', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(7, 'freq[char]++;', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Question 8: Longest Palindromic Substring
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(8, 'while (left >= 0 && right < s.length && s[left] === s[right]) { count++; left--; right++; }', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8, 'while (left < right) { left++; right++; }', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8, 'return s.substring(left, right);', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8, 'if (s[left] === s[right]) return left;', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Question 9: Group Anagrams
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(9, 'map.has(key) ? map.get(key).push(str) : map.set(key, [str]);', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(9, 'map.set(key, str);', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(9, 'if (map.has(str)) map.get(str).push(key);', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(9, 'result.push([...map.values()]);', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Question 10: Three Sum
INSERT INTO answers (question_id, answer_text, answer_label, is_correct, archived, created_date, changed_date) VALUES
(10, 'if (nums[i] > 0) break;', 'a', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(10, 'if (nums[i] === 0) break;', 'b', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(10, 'if (i > nums.length / 2) break;', 'c', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(10, 'if (i > 0 && nums[i] === nums[i-1]) continue;', 'd', FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
