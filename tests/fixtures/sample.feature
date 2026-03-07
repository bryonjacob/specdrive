@RID-STRAT-001
Feature: Built-in strategy types
  Strategies produce valid arbitrary values for common types.

  @RID-STRAT-002 @property-based
  Rule: Text strategy produces strings

    Scenario: Text strategy
      Given any text <T>
      Then <T> is a string

  @RID-STRAT-003 @property-based
  Rule: Integer strategy produces integers

    Scenario: Integer strategy
      Given any integer <N>
      Then <N> is an integer
