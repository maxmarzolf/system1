def rob_state(nums):                                        
    dp = [0] * (len(nums) + 1)                              # every dp problem needs a 1 or 2 dimensional array
    for i, val in enumerate(nums, 1):                       # loop with index and value because...
        take = val + (dp[i - 2] if i >= 2 else 0)           # add current val and previous for running total -> essense of dp?
        skip = dp[i - 1]                                    # grab previous val
        dp[i] = max(take, skip)                             # calculate best? seems common in many areas?
    return dp[-1]                                           # return the last item in the array since that's the shit



# LLM
def rob_state(nums):
    dp = [0] * (len(nums) + 1)                              # state table indexed by prefix
    for i, val in enumerate(nums, 1):                       # build states left to right
        take = val + (dp[i - 2] if i >= 2 else 0)           # build from solved states candidate using current item state stores best answer so far
        skip = dp[i - 1]                                    # candidate carrying previous best
        dp[i] = max(take, skip)                             # transition stores best candidate
    return dp[-1]                                           # answer is final state


# Ours
def rob_state(nums):
    dp = [0] * (len(nums) + 1)                              # state table indexed by prefix; state stores best answer so far
    for i, val in enumerate(nums, 1):                       # build states left to right
        take = val + (dp[i - 2] if i >= 2 else 0)           # build from solved states
        skip = dp[i - 1]                                    # candidate carrying previous best
        dp[i] = max(take, skip)                             # stores best candidate
    return dp[-1]                                           # answer is final state



# LLM
def rob_state(nums):
    dp = [0] * (len(nums) + 1)                              # dp[i] means best using first i items
    for i, val in enumerate(nums, 1):                       # look at each item in order
        take = val + (dp[i - 2] if i >= 2 else 0)           # build from solved states use this item plus earlier safe best at each item choose take or skip
        skip = dp[i - 1]                                    # ignore this item and keep previous best
        dp[i] = max(take, skip)                             # choose the better of taking or skipping
    return dp[-1]                                           # final slot holds the full answer



# Ours
def rob_state(nums):
    dp = [0] * (len(nums) + 1)                              # dp[i] means best using first i items
    for i, val in enumerate(nums, 1):                       # look at each item in order
        take = val + (dp[i - 2] if i >= 2 else 0)           # build from solved states use this item plus earlier safe best at each item choose take or skip
        skip = dp[i - 1]                                    # grab previous best since state represent best at current index 
        dp[i] = max(take, skip)                             # evaluate current (taking) and previous (skipping) best
    return dp[-1]                                           # final slot holds the full answer



# LLM
def rob_state(nums):
    dp = [0] * (len(nums) + 1)                              # stores solved smaller answers
    for i, val in enumerate(nums, 1):                       # each step extends the solved prefix
        take = val + (dp[i - 2] if i >= 2 else 0)           # build from solved states  build from solved states  taking blocks the adjacent previous item  current best depends on earlier bests
        skip = dp[i - 1]                                    # skipping preserves the known best
        dp[i] = max(take, skip)                             # optimal answer is the better valid choice
    return dp[-1]                                           # all choices have been summarized



# Ours
def rob_state(nums):
    dp = [0] * (len(nums) + 1)                              # stores previous best answers
    for i, val in enumerate(nums, 1):                       # each step extends the solved prefix
        take = val + (dp[i - 2] if i >= 2 else 0)           # build from solved states taking blocks the adjacent previous item current best depends on earlier bests
        skip = dp[i - 1]                                    # skipping preserves the known best
        dp[i] = max(take, skip)                             # optimal answer is the better valid choice
    return dp[-1]                                           # all choices have been summarized




def rob_state(nums):
    dp = [0] * (len(nums) + 1)
    for i, val in enumerate(nums, 1):
        take = val + (dp[i - 2] if i >= 2 else 0)
        skip = dp[i - 1]
        dp[i] = max(take, skip)
    return dp[-1]