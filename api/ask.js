return res
          .status(400)
          .json({
            error:
              "Question is too long"
          });
      }


      // ---------------------------------------------------
      // LOAD SUPABASE
      // ---------------------------------------------------

      const loadedRows =
        await getLessons();


      const rows =
        Array.isArray(
          loadedRows
        )
          ? loadedRows
          : [];


      // ---------------------------------------------------
      // RANK
      // ---------------------------------------------------

      const ranked =
        rows

          .map(
            row => ({

              row,

              score:
                scoreRow(
                  row,
                  question,
                  language
                )

            })
          )

          .filter(
            item =>
              item.score > 0
          )

          .sort(
            (a, b) =>
              b.score -
              a.score
          );


      // ---------------------------------------------------
      // SOURCE LIMIT
      // ---------------------------------------------------

      const sourceLimit =
        answerLevel === 1
          ? 6
          : answerLevel === 3
          ? 14
          : 10;


      // ---------------------------------------------------
      // TOPIC-COHERENT SELECTION
      // ---------------------------------------------------

      const coherentRanked =
        selectCoherentRows(
          ranked,
          question,
          sourceLimit
        );


      const selected =
        buildSources(
          coherentRanked,
          sourceLimit
        );


      // ---------------------------------------------------
      // GENERATE
      // ---------------------------------------------------

      let answer = "";

      let generationUsed =
        false;


      try {

        answer =
          await generateWithGemini(
            question,
            language,
            selected,
            answerLevel
          );


        generationUsed =
          true;

      } catch (generationError) {

        console.error(
          "Gemini generation failed:",
          generationError?.message ||
          generationError
        );


        // -------------------------------------------------
        // SAFE FALLBACK
        // -------------------------------------------------

        answer =
          fallbackAnswer(
            coherentRanked,
            language
          );
      }


      // ---------------------------------------------------
      // NO ANSWER
      // ---------------------------------------------------

      if (!answer) {

        return res
          .status(503)
          .json({

            error:
              "The answer service is temporarily unavailable.",

            matchedCount:
              ranked.length,

            coherentCount:
              coherentRanked.length
          });
      }


      // ---------------------------------------------------
      // RESPONSE
      // ---------------------------------------------------

      return res
        .status(200)
        .json({

          answer,

          language,

          answerLevel,

          detectedTopics:
            detectTopics(
              question
            )
              .map(
                topic =>
                  topic.name
              ),

          matchedCount:
            ranked.length,

          coherentCount:
            coherentRanked.length,

          usedKnowledgeSources:
            selected.length,

          generationUsed,

          sources:
            selected.map(
              source => ({

                question:
                  source.question,

                category:
                  source.category,

                education_level:
                  source.education_level,

                bible_references:
                  source.bible_references,

                church_sources:
                  source.church_sources,

comparison_group:
                  source.comparison_group
              })
            )
        });


    } catch (error) {

      console.error(
        "/api/ask error:",
        error?.message ||
        error
      );


      return res
        .status(500)
        .json({

          error:
            "Unable to answer the question right now."
        });
    }
  };
